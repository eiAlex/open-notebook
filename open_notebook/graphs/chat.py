import asyncio
import sqlite3
from typing import Annotated, Optional

from ai_prompter import Prompter
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from loguru import logger
from typing_extensions import TypedDict

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.config import LANGGRAPH_CHECKPOINT_FILE
from open_notebook.domain.notebook import Notebook
from open_notebook.exceptions import OpenNotebookError
from open_notebook.utils import clean_thinking_content
from open_notebook.utils.error_classifier import classify_error
from open_notebook.utils.text_utils import extract_text_content

MAX_TOOL_ITERATIONS = 10


class ThreadState(TypedDict):
    messages: Annotated[list, add_messages]
    notebook: Optional[Notebook]
    context: Optional[str]
    context_config: Optional[dict]
    model_override: Optional[str]


async def _build_mcp_server_configs(notebook_id: Optional[str] = None) -> dict:
    """Return a MultiServerMCPClient-compatible config dict from enabled MCP servers."""
    try:
        import langchain_mcp_adapters  # noqa: F401
    except ImportError:
        logger.warning("langchain-mcp-adapters not installed; MCP tools disabled. Run 'uv sync' or rebuild the Docker image.")
        return {}

    try:
        from open_notebook.domain.mcp_server import McpServer

        if notebook_id:
            servers = await McpServer.get_enabled_for_notebook(notebook_id)
        else:
            servers = await McpServer.get_enabled()

        configs = {}
        for s in servers:
            if s.transport == "stdio" and s.command:
                configs[s.name] = {
                    "command": s.command,
                    "args": s.args or [],
                    "env": s.env or {},
                    "transport": "stdio",
                }
            elif s.transport in ("sse", "streamable_http") and s.url:
                cfg: dict = {"url": s.url, "transport": s.transport}
                if s.headers:
                    cfg["headers"] = s.headers
                configs[s.name] = cfg
        return configs
    except Exception as e:
        logger.warning(f"Could not load MCP server configs: {e}")
        return {}


async def _run_agent_turn(state: ThreadState, model_id: Optional[str]) -> AIMessage:
    """
    Run one full ReAct turn:
    - provision model
    - load MCP tools (if any)
    - loop: invoke model → if tool_calls, execute tools → repeat until final answer
    """
    history = list(state.get("messages", []))

    model = await provision_langchain_model(
        str(history), model_id, "chat", max_tokens=8192
    )

    notebook: Optional[Notebook] = state.get("notebook")
    notebook_id = str(notebook.id) if notebook and notebook.id else None
    server_configs = await _build_mcp_server_configs(notebook_id)

    if not server_configs:
        system_prompt = Prompter(prompt_template="chat/system").render(data=state)  # type: ignore[arg-type]
        payload = [SystemMessage(content=system_prompt)] + history
        ai_message = model.invoke(payload)
        content = extract_text_content(ai_message.content)
        return ai_message.model_copy(update={"content": clean_thinking_content(content)})

    # With MCP servers: keep client alive for full ReAct loop
    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient
    except ImportError:
        logger.warning("langchain-mcp-adapters not installed. Run 'uv sync' to enable MCP tools. Proceeding without tools.")
        system_prompt = Prompter(prompt_template="chat/system").render(data=state)  # type: ignore[arg-type]
        payload = [SystemMessage(content=system_prompt)] + history
        ai_message = model.invoke(payload)
        content = extract_text_content(ai_message.content)
        return ai_message.model_copy(update={"content": clean_thinking_content(content)})

    try:
        client = MultiServerMCPClient(server_configs)
        tools = await client.get_tools()
    except Exception as e:
        logger.warning(f"Failed to connect to MCP server(s), proceeding without tools: {e}")
        system_prompt = Prompter(prompt_template="chat/system").render(data=state)  # type: ignore[arg-type]
        payload = [SystemMessage(content=system_prompt)] + history
        ai_message = model.invoke(payload)
        content = extract_text_content(ai_message.content)
        return ai_message.model_copy(update={"content": clean_thinking_content(content)})

    tool_map = {t.name: t for t in tools}
    logger.debug(f"MCP tools available: {list(tool_map.keys())}")

    # Render system prompt with tool names so the model knows what it can do
    tool_names = list(tool_map.keys())
    render_data = dict(state)
    render_data["mcp_tool_names"] = tool_names
    system_prompt = Prompter(prompt_template="chat/system").render(data=render_data)  # type: ignore[arg-type]
    payload = [SystemMessage(content=system_prompt)] + history

    if not tools:
        ai_message = model.invoke(payload)
        content = extract_text_content(ai_message.content)
        return ai_message.model_copy(update={"content": clean_thinking_content(content)})

    bound_model = model.bind_tools(tools)
    working_messages = list(payload)
    response = None

    for _ in range(MAX_TOOL_ITERATIONS):
        response = bound_model.invoke(working_messages)

        if not getattr(response, "tool_calls", None):
            content = extract_text_content(response.content)
            return response.model_copy(update={"content": clean_thinking_content(content)})

        working_messages.append(response)
        for tc in response.tool_calls:
            tool = tool_map.get(tc["name"])
            if tool is None:
                result = f"Tool '{tc['name']}' not found."
            else:
                try:
                    result = await tool.ainvoke(tc["args"])
                except Exception as e:
                    result = f"Tool error: {e}"
            working_messages.append(
                ToolMessage(content=str(result), tool_call_id=tc["id"])
            )

    logger.warning("MCP ReAct loop reached max iterations, returning last response")
    content = extract_text_content(response.content)  # type: ignore[possibly-undefined]
    return response.model_copy(update={"content": clean_thinking_content(content)})  # type: ignore[possibly-undefined]


def call_model_with_messages(state: ThreadState, config: RunnableConfig) -> dict:
    model_id = config.get("configurable", {}).get("model_id") or state.get("model_override")

    def run_in_new_loop():
        new_loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(new_loop)
            return new_loop.run_until_complete(_run_agent_turn(state, model_id))
        finally:
            new_loop.close()
            asyncio.set_event_loop(None)

    try:
        try:
            asyncio.get_running_loop()
            # Running inside an event loop — use a thread with its own loop
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                ai_message = executor.submit(run_in_new_loop).result()
        except RuntimeError as e:
            if "no running event loop" in str(e).lower() or "no current event loop" in str(e).lower():
                ai_message = asyncio.run(_run_agent_turn(state, model_id))
            else:
                raise
    except OpenNotebookError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e

    return {"messages": ai_message}


conn = sqlite3.connect(
    LANGGRAPH_CHECKPOINT_FILE,
    check_same_thread=False,
)
memory = SqliteSaver(conn)

agent_state = StateGraph(ThreadState)
agent_state.add_node("agent", call_model_with_messages)
agent_state.add_edge(START, "agent")
agent_state.add_edge("agent", END)
graph = agent_state.compile(checkpointer=memory)
