# {{projectName}}

{{description}}

Python MCP server over [Streamable HTTP](https://modelcontextprotocol.io/specification/latest/basic/transports#streamable-http), built on the official [`mcp`](https://pypi.org/project/mcp/) SDK (2.x, `MCPServer`). Runs **stateless**, so it scales horizontally behind any load balancer.

## Develop

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
uv run {{projectName}}      # http://127.0.0.1:3000/mcp
```

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | listen port |
| `HOST` | `127.0.0.1` | bind address; localhost enables DNS-rebinding protection |
| `ALLOWED_HOSTS` | – | comma-separated `Host` header allowlist (e.g. `api.example.com`) when binding to `0.0.0.0` |

Health check: `GET /healthz`.

Debug with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector): `npx @modelcontextprotocol/inspector`, transport *Streamable HTTP*, URL `http://127.0.0.1:3000/mcp`.

## Use with an MCP client

```bash
npx @baum97/create-mcp-server config . --client claude-code   # or vscode, cursor, claude-desktop
```

## Deploy

```bash
docker build -t {{projectName}} .
docker run -p 3000:3000 -e ALLOWED_HOSTS=your.domain {{projectName}}
```

Before exposing it publicly, add authentication (`MCPServer` accepts a `token_verifier` / `auth_server_provider`) and put it behind HTTPS. Then list it in the registry with `npx @baum97/create-mcp-server registry . --url https://your.domain/mcp`.

## Add more tools

```bash
npx @baum97/create-mcp-server add tool my-tool --description "What it does"
```

> **Note:** In `mcp` 2.x, `FastMCP` was renamed to `MCPServer` (`from mcp.server.mcpserver import MCPServer`). Many tutorials online still show the 1.x import.
