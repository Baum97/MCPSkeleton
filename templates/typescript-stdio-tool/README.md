# {{projectName}}

{{description}}

## Develop

```bash
npm install
npm run dev        # run from source with tsx
npm run build      # compile to dist/
npm start          # run the compiled server
```

Debug interactively with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) (needs Node ≥ 22.19):

```bash
npm run build && npm run inspect
```

## Use with an MCP client

Print a ready-to-paste config snippet (or merge it with `--write`):

```bash
npx create-mcp-server config . --client claude-desktop   # or claude-code, cursor, vscode
```

Or add it to `claude_desktop_config.json` by hand:

```json
{
  "mcpServers": {
    "{{projectName}}": {
      "command": "node",
      "args": ["/absolute/path/to/{{projectName}}/dist/index.js"]
    }
  }
}
```

With Claude Code:

```bash
claude mcp add {{projectName}} -- node /absolute/path/to/{{projectName}}/dist/index.js
```

## Package as a one-click MCP Bundle (.mcpb)

`manifest.json` describes this server as an [MCP Bundle](https://github.com/modelcontextprotocol/mcpb) (formerly Desktop Extension, `.dxt`), which Claude Desktop installs with a double-click:

```bash
npm run build
npm prune --omit=dev            # the bundle ships node_modules — keep it lean
npx @anthropic-ai/mcpb validate manifest.json
npx @anthropic-ai/mcpb pack     # writes {{projectName}}.mcpb
npm install                     # restore dev dependencies
```

Keep the `tools` list in `manifest.json` in sync with what the server registers.

## Publish

1. `npm publish` — then anyone can run it with `npx {{projectName}}`.
2. Optional: list it in the official [MCP Registry](https://registry.modelcontextprotocol.io) with [`mcp-publisher`](https://github.com/modelcontextprotocol/registry) (`mcp-publisher init` creates `server.json`; add a matching `"mcpName"` to `package.json`).

## Add more tools

Edit `src/index.ts` and call `server.registerTool(name, { title, description, inputSchema, outputSchema?, annotations? }, handler)`. Input schemas are [zod](https://zod.dev) shapes.
