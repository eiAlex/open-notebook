from typing import Dict, List

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from open_notebook.domain.mcp_server import get_notebook_mcp_states, set_notebook_mcp_state, McpServer

router = APIRouter(prefix="/notebooks", tags=["notebook_mcp"])


class NotebookMcpState(BaseModel):
    mcp_server_id: str
    name: str
    description: str | None = None
    transport: str
    enabled: bool


class SetNotebookMcpRequest(BaseModel):
    mcp_server_id: str
    enabled: bool


@router.get("/{notebook_id}/mcp-servers", response_model=List[NotebookMcpState])
async def list_notebook_mcp_servers(notebook_id: str):
    """Return all globally-enabled MCP servers with their per-notebook enabled state."""
    try:
        servers = await McpServer.get_all()
        states = await get_notebook_mcp_states(notebook_id)
        result = []
        for s in servers:
            if not s.enabled:
                continue
            sid = str(s.id)
            result.append(NotebookMcpState(
                mcp_server_id=sid,
                name=s.name,
                description=s.description,
                transport=s.transport,
                enabled=states.get(sid, True),
            ))
        return result
    except Exception as e:
        logger.error(f"Error listing notebook MCP servers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{notebook_id}/mcp-servers", response_model=Dict[str, bool])
async def set_notebook_mcp_server(notebook_id: str, request: SetNotebookMcpRequest):
    """Enable or disable a specific MCP server for a notebook."""
    try:
        await set_notebook_mcp_state(notebook_id, request.mcp_server_id, request.enabled)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error setting notebook MCP state: {e}")
        raise HTTPException(status_code=500, detail=str(e))
