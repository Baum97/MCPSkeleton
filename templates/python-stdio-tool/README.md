# {{projectName}}

{{description}}

Python MCP server over stdio, built on the official [`mcp`](https://pypi.org/project/mcp/) SDK (2.x, `MCPServer`).

## Develop

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run server.py
```

Debug interactively with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector uv run server.py
```

## Use with an MCP client

Print a ready-to-paste config snippet for your client:

```bash
npx create-mcp-server config . --client claude-desktop   # or claude-code, cursor, vscode
```

Or add it to `claude_desktop_config.json` by hand:

```json
{
  "mcpServers": {
    "{{projectName}}": {
      "command": "uv",
      "args": ["--directory", "/absolute/path/to/{{projectName}}", "run", "server.py"]
    }
  }
}
```

## Add more tools

Decorate a typed function with `@mcp.tool()` in `server.py`. The type hints become the input schema and the docstring becomes the description.

> **Note:** In `mcp` 2.x, `FastMCP` was renamed to `MCPServer` (`from mcp.server.mcpserver import MCPServer`). Many tutorials online still show the 1.x import.
