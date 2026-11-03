"""MCP server entry point (Streamable HTTP)."""

import os

from starlette.requests import Request
from starlette.responses import JSONResponse

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

mcp = MCPServer("{{projectName}}")


@mcp.tool()
def echo(message: str) -> str:
    """Echo a message back to the caller."""
    return f"You said: {message}"


@mcp.custom_route("/healthz", methods=["GET"])
async def healthz(_request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


# create-mcp-server:add — `npx @baum97/create-mcp-server add` inserts new tools, resources and prompts above this line.


def main() -> None:
    # 127.0.0.1 (the default) enables DNS-rebinding protection automatically.
    # Set HOST=0.0.0.0 in a container and list public hostnames in ALLOWED_HOSTS.
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "3000"))
    allowed = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h.strip()]
    security = TransportSecuritySettings(allowed_hosts=allowed) if allowed else None

    mcp.run(
        transport="streamable-http",
        host=host,
        port=port,
        # Stateless: no session affinity needed, scales horizontally.
        stateless_http=True,
        transport_security=security,
    )


if __name__ == "__main__":
    main()
