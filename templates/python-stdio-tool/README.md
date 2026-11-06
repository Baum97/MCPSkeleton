# {{projectName}}

{{description}}

Python MCP server over stdio, built on the official [`mcp`](https://pypi.org/project/mcp/) SDK (2.x, `MCPServer`).

## Develop

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run {{projectName}}
```

Debug interactively with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector uv run {{projectName}}
```

## Use with an MCP client

Print a ready-to-paste config snippet for your client (or merge it with `--write`):

```bash
npx @baum97/create-mcp-server config . --client claude-desktop   # or claude-code, cursor, vscode
```

Or add it to `claude_desktop_config.json` by hand:

```json
{
  "mcpServers": {
    "{{projectName}}": {
      "command": "uv",
      "args": ["--directory", "/absolute/path/to/{{projectName}}", "run", "{{projectName}}"]
    }
  }
}
```

## Add more tools

```bash
npx @baum97/create-mcp-server add tool my-tool --description "What it does"
```

Or decorate a typed function with `@mcp.tool()` in `src/{{packageName}}/server.py`. The type hints become the input schema and the docstring becomes the description.

## Publish

```bash
uv build && uv publish          # to PyPI — then anyone can run `uvx {{projectName}}`
npx @baum97/create-mcp-server registry .   # writes server.json for the MCP Registry
```

`registry` also adds the `mcp-name:` line to this README, which the [MCP Registry](https://registry.modelcontextprotocol.io) uses to verify you own the PyPI package. Publish the README change to PyPI first, then run `mcp-publisher publish`.

> **Note:** In `mcp` 2.x, `FastMCP` was renamed to `MCPServer` (`from mcp.server.mcpserver import MCPServer`). Many tutorials online still show the 1.x import.
