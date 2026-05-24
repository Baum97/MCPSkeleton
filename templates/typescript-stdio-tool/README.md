# {{projectName}}

{{description}}

## Develop

```bash
npm install
npm run dev
```

## Build & run

```bash
npm run build
npm start
```

## Use with Claude Desktop

Add to your `claude_desktop_config.json`:

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

Restart Claude Desktop. The `echo` tool will be available.

## Add more tools

Edit `src/index.ts` and call `server.tool(name, description, schema, handler)`.
