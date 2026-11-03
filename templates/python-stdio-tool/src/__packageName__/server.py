"""MCP server entry point."""

from mcp.server.mcpserver import MCPServer

mcp = MCPServer("{{projectName}}")


@mcp.tool()
def echo(message: str) -> str:
    """Echo a message back to the caller."""
    return f"You said: {message}"


@mcp.tool()
def add(a: float, b: float) -> float:
    """Add two numbers."""
    return a + b


@mcp.resource("info://server")
def server_info() -> str:
    """Basic information about this MCP server."""
    return '{"name": "{{projectName}}", "version": "0.1.0"}'


@mcp.prompt()
def review_code(code: str) -> str:
    """Ask the model to review a code snippet."""
    return f"Please review this code:\n\n{code}"


# create-mcp-server:add — `npx @baum97/create-mcp-server add` inserts new tools, resources and prompts above this line.


def main() -> None:
    # stdout is reserved for JSON-RPC messages — never print() to it.
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
