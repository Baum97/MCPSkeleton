# create-mcp-server

Scaffold a Model Context Protocol server in seconds. Like `create-react-app`, but for MCP.

## Status

Early groundwork — one working template (`typescript-stdio-tool`). See [Roadmap](#roadmap).

## Try it locally

```bash
npm install
npm run build
node dist/cli.js my-server
```

Or in dev mode (no build):

```bash
npm run dev -- my-server
```

Flags:
- `-t, --template <name>` — pick template non-interactively
- `-y, --yes` — accept all defaults

## Architecture

```
src/
  cli.ts          CLI entry (commander)
  prompts.ts      Interactive prompts (@inquirer/prompts)
  templates.ts    Discover templates/ at runtime
  generator.ts    Copy template + replace placeholders
templates/
  typescript-stdio-tool/
    template.json     metadata (name, description)
    package.json      uses {{projectName}}, {{description}}, {{author}}
    src/index.ts      stdio MCP server with one example tool
    _gitignore        renamed to .gitignore on copy (npm strips real .gitignore)
```

### Adding a new template

1. Create `templates/<name>/`
2. Add a `template.json` with `{ "description": "..." }`
3. Put real, runnable code inside — use `{{projectName}}`, `{{description}}`, `{{author}}` where you want substitution
4. Files eligible for placeholder replacement live in `PLACEHOLDER_FILES` in [generator.ts](src/generator.ts) — extend if needed
5. Use `_gitignore` instead of `.gitignore` (auto-renamed)

## Roadmap

- [ ] More templates: `typescript-stdio-resource`, `typescript-http-full`, `python-stdio-tool`
- [ ] Auto-install deps (`npm install`) after generate, with flag
- [ ] Auto-init git repo
- [ ] Helper to add Claude Desktop config entry
- [ ] `mcp add tool <name>` subcommand to extend an existing project
- [ ] Publish to npm as `create-mcp-server` so `npm create mcp-server` works
- [ ] Tests (vitest) — at minimum, generate each template into a tmpdir and run `tsc`

## Design notes

- **Templates are real, runnable projects** with placeholders, not a DSL. Lower mental tax, easier to test, easier to contribute.
- **Replacements are scoped** to `package.json`, `README.md`, `tsconfig.json` by default. Keep source files clean of template syntax so they stay valid TypeScript.
- **`_gitignore` rename trick** — npm refuses to publish a real `.gitignore` inside a package, so templates ship the underscore form.
