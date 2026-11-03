# {{projectName}}

{{description}}

MCP server over [Streamable HTTP](https://modelcontextprotocol.io/specification/latest/basic/transports#streamable-http) — the current remote transport (the older HTTP+SSE transport is deprecated). Runs **stateless**: a fresh server per request, so it scales horizontally behind any load balancer.

## Develop

```bash
npm install
npm run dev        # http://127.0.0.1:3000/mcp
npm run build && npm start
```

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | listen port |
| `HOST` | `127.0.0.1` | bind address; localhost enables DNS-rebinding protection |
| `ALLOWED_HOSTS` | – | comma-separated `Host` header allowlist when binding to `0.0.0.0` |

Health check: `GET /healthz`.

Debug with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) (needs Node ≥ 22.19): run `npm run inspect`, choose transport *Streamable HTTP* and enter `http://127.0.0.1:3000/mcp`.

## Use with an MCP client

```bash
npx create-mcp-server config . --client claude-code   # or vscode, cursor, claude-desktop
```

- **Claude Code:** `claude mcp add --transport http {{projectName}} http://127.0.0.1:3000/mcp`
- **VS Code** (`.vscode/mcp.json`): `{ "servers": { "{{projectName}}": { "type": "http", "url": "http://127.0.0.1:3000/mcp" } } }`
- **Claude Desktop / claude.ai:** deploy publicly and add the URL under *Settings → Connectors*.

## Deploy

```bash
docker build -t {{projectName}} .
docker run -p 3000:3000 -e ALLOWED_HOSTS=your.domain {{projectName}}
```

Before exposing it publicly, add authentication (the SDK ships OAuth helpers under `@modelcontextprotocol/sdk/server/auth`) and put it behind HTTPS.

## Add more tools

Register them inside `buildServer()` in `src/index.ts` with `server.registerTool(...)`.
