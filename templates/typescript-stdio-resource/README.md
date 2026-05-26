# {{projectName}}

{{description}}

Exposes MCP resources over stdio:

- `info://server` — static JSON describing the server
- `greeting://{name}` — templated text resource

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

## Add more resources

Edit `src/index.ts`. Use `server.resource(name, uri | template, metadata, handler)`. Templated URIs use `new ResourceTemplate('scheme://{var}/{other}', { list: undefined })`.
