from typing import ClassVar, Dict, List, Optional

from open_notebook.domain.base import ObjectModel


class McpServer(ObjectModel):
    table_name: ClassVar[str] = "mcp_server"

    name: str
    description: Optional[str] = None
    enabled: bool = True

    # Transport: "stdio" | "sse" | "streamable_http"
    transport: str = "stdio"

    # stdio transport fields
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None

    # sse / streamable_http transport fields
    url: Optional[str] = None
    headers: Optional[Dict[str, str]] = None

    @classmethod
    async def get_enabled(cls) -> List["McpServer"]:
        """Return all globally-enabled MCP servers."""
        from open_notebook.database.repository import repo_query

        results = await repo_query(
            "SELECT * FROM mcp_server WHERE enabled = true ORDER BY name"
        )
        return [cls(**r) for r in results] if results else []

    @classmethod
    async def get_enabled_for_notebook(cls, notebook_id: str) -> List["McpServer"]:
        """Return MCP servers active for a specific notebook.

        Logic:
        - Global enabled=false → always excluded
        - notebook_mcp record exists → use its enabled flag
        - no record → include (default on)
        """
        from open_notebook.database.repository import repo_query

        all_servers = await repo_query(
            "SELECT * FROM mcp_server WHERE enabled = true ORDER BY name"
        )
        if not all_servers:
            return []

        overrides_raw = await repo_query(
            "SELECT * FROM notebook_mcp WHERE notebook_id = $notebook_id",
            {"notebook_id": notebook_id},
        )
        overrides = {r["mcp_server_id"]: r["enabled"] for r in (overrides_raw or [])}

        return [
            cls(**s)
            for s in all_servers
            if overrides.get(str(s["id"]), True) is not False
        ]


async def get_notebook_mcp_states(notebook_id: str) -> Dict[str, bool]:
    """Return {mcp_server_id: enabled} for all globally-enabled servers in a notebook."""
    from open_notebook.database.repository import repo_query

    servers = await repo_query(
        "SELECT * FROM mcp_server WHERE enabled = true ORDER BY name"
    )
    overrides_raw = await repo_query(
        "SELECT * FROM notebook_mcp WHERE notebook_id = $notebook_id",
        {"notebook_id": notebook_id},
    )
    overrides = {r["mcp_server_id"]: r["enabled"] for r in (overrides_raw or [])}
    return {
        str(s["id"]): overrides.get(str(s["id"]), True)
        for s in (servers or [])
    }


async def set_notebook_mcp_state(notebook_id: str, mcp_server_id: str, enabled: bool) -> None:
    """Upsert the per-notebook enabled state for one MCP server."""
    from open_notebook.database.repository import repo_query, repo_upsert

    existing = await repo_query(
        "SELECT * FROM notebook_mcp WHERE notebook_id = $nid AND mcp_server_id = $mid LIMIT 1",
        {"nid": notebook_id, "mid": mcp_server_id},
    )
    if existing:
        record = existing[0]
        raw_id = record["id"]
        # Extract the bare ID part (after "notebook_mcp:")
        if hasattr(raw_id, "id"):
            bare_id = str(raw_id.id)
        else:
            str_id = str(raw_id)
            bare_id = str_id.split(":", 1)[1] if ":" in str_id else str_id
        await repo_upsert(
            "notebook_mcp",
            f"notebook_mcp:{bare_id}",
            {"notebook_id": notebook_id, "mcp_server_id": mcp_server_id, "enabled": enabled},
            add_timestamp=True,
        )
    else:
        await repo_query(
            "CREATE notebook_mcp SET notebook_id = $nid, mcp_server_id = $mid, enabled = $enabled, created = time::now(), updated = time::now()",
            {"nid": notebook_id, "mid": mcp_server_id, "enabled": enabled},
        )
