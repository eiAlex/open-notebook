from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from open_notebook.domain.mcp_server import McpServer
from open_notebook.exceptions import NotFoundError

router = APIRouter(prefix="/mcp-servers", tags=["mcp_servers"])


class McpServerRequest(BaseModel):
    name: str
    description: Optional[str] = None
    enabled: bool = True
    transport: str = "stdio"
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    url: Optional[str] = None
    headers: Optional[Dict[str, str]] = None


class McpServerResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    enabled: bool
    transport: str
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    url: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    created: Optional[str] = None
    updated: Optional[str] = None


class McpTestResponse(BaseModel):
    success: bool
    message: str
    tools: Optional[List[str]] = None


def _to_response(server: McpServer) -> McpServerResponse:
    return McpServerResponse(
        id=str(server.id),
        name=server.name,
        description=server.description,
        enabled=server.enabled,
        transport=server.transport,
        command=server.command,
        args=server.args,
        env=server.env,
        url=server.url,
        headers=server.headers,
        created=str(server.created) if server.created else None,
        updated=str(server.updated) if server.updated else None,
    )


@router.get("", response_model=List[McpServerResponse])
async def list_mcp_servers():
    servers = await McpServer.get_all()
    return [_to_response(s) for s in servers]


@router.post("", response_model=McpServerResponse)
async def create_mcp_server(request: McpServerRequest):
    try:
        server = McpServer(**request.model_dump())
        await server.save()
        return _to_response(server)
    except Exception as e:
        logger.error(f"Error creating MCP server: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{server_id}", response_model=McpServerResponse)
async def get_mcp_server(server_id: str):
    full_id = server_id if server_id.startswith("mcp_server:") else f"mcp_server:{server_id}"
    try:
        server = await McpServer.get(full_id)
        if not server:
            raise HTTPException(status_code=404, detail="MCP server not found")
        return _to_response(server)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="MCP server not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching MCP server {server_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{server_id}", response_model=McpServerResponse)
async def update_mcp_server(server_id: str, request: McpServerRequest):
    full_id = server_id if server_id.startswith("mcp_server:") else f"mcp_server:{server_id}"
    try:
        server = await McpServer.get(full_id)
        if not server:
            raise HTTPException(status_code=404, detail="MCP server not found")
        for field, value in request.model_dump().items():
            setattr(server, field, value)
        await server.save()
        return _to_response(server)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="MCP server not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating MCP server {server_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{server_id}")
async def delete_mcp_server(server_id: str):
    full_id = server_id if server_id.startswith("mcp_server:") else f"mcp_server:{server_id}"
    try:
        server = await McpServer.get(full_id)
        if not server:
            raise HTTPException(status_code=404, detail="MCP server not found")
        await server.delete()
        return {"success": True}
    except NotFoundError:
        raise HTTPException(status_code=404, detail="MCP server not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting MCP server {server_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{server_id}/test", response_model=McpTestResponse)
async def test_mcp_server(server_id: str):
    full_id = server_id if server_id.startswith("mcp_server:") else f"mcp_server:{server_id}"
    try:
        server = await McpServer.get(full_id)
        if not server:
            raise HTTPException(status_code=404, detail="MCP server not found")
    except NotFoundError:
        raise HTTPException(status_code=404, detail="MCP server not found")

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient
    except ImportError:
        return McpTestResponse(
            success=False,
            message="langchain-mcp-adapters not installed. Run 'uv sync' or rebuild the Docker image.",
        )

    # Build config for this single server
    if server.transport == "stdio":
        if not server.command:
            return McpTestResponse(success=False, message="stdio transport requires a command.")
        config = {
            server.name: {
                "command": server.command,
                "args": server.args or [],
                "env": server.env or {},
                "transport": "stdio",
            }
        }
    elif server.transport in ("sse", "streamable_http"):
        if not server.url:
            return McpTestResponse(success=False, message=f"{server.transport} transport requires a URL.")
        cfg: dict = {"url": server.url, "transport": server.transport}
        if server.headers:
            cfg["headers"] = server.headers
        config = {server.name: cfg}
    else:
        return McpTestResponse(success=False, message=f"Unknown transport: {server.transport}")

    try:
        client = MultiServerMCPClient(config)
        tools = await client.get_tools()
        tool_names = [t.name for t in tools]
        return McpTestResponse(
            success=True,
            message=f"Connected successfully. Found {len(tool_names)} tool(s).",
            tools=tool_names,
        )
    except Exception as e:
        logger.warning(f"MCP server test failed for {server.name}: {e}")
        return McpTestResponse(success=False, message=str(e))
