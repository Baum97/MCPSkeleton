# create-mcp-server

Scaffold a Model Context Protocol server in seconds. Like `create-react-app`, but for MCP.

## Templates

| Template | Language | Transport | What you get |
|---|---|---|---|
| `typescript-stdio-tool` *(default)* | TypeScript | stdio | one example tool — the minimal starting point |
| `typescript-stdio-resource` | TypeScript | stdio | a static and a templated resource |
| `typescript-stdio-full` | TypeScript | stdio | tools with structured output, listable resources with completion, prompts |
| `typescript-streamable-http` | TypeScript | Streamable HTTP | stateless Express server, health check, Dockerfile — for remote deployment |
| `python-stdio-tool` | Python | stdio | `mcp` 2.x `MCPServer` with tool/resource/prompt, managed with [uv](https://docs.astral.sh/uv/) |

Every generated project also comes with:

- an `inspect` script / instructions for the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
- for stdio Node templates: a `manifest.json` so it can be packed into a one-click [MCP Bundle (`.mcpb`)](https://github.com/modelcontextprotocol/mcpb) for Claude Desktop
- README sections on connecting it to clients and publishing to npm / the [MCP Registry](https://registry.modelcontextprotocol.io)

TypeScript templates use the current `McpServer.registerTool/registerResource/registerPrompt` API (the older `tool()`/`resource()` helpers are deprecated) with zod 4.

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
- `-y, --yes` — accept all defaults (implies `--no-install`, `--no-git`)
- `--install` / `--no-install` — install deps after generate (auto-detects npm/pnpm/yarn/bun)
- `--git` / `--no-git` — `git init` + initial commit after generate (Python templates install with `uv sync`)

## Connect a server to a client

```bash
create-mcp-server config <dir> --client claude-desktop   # print the snippet
create-mcp-server config <dir> --client claude-desktop --write   # merge it into the config file
```

| `--client` | Config file | Notes |
|---|---|---|
| `claude-desktop` | `claude_desktop_config.json` (per-OS path) | HTTP servers are bridged via `npx mcp-remote` |
| `claude-code` | `./.mcp.json` | also prints the equivalent `claude mcp add …` command |
| `cursor` | `~/.cursor/mcp.json` | |
| `vscode` | `./.vscode/mcp.json` | uses VS Code's `servers` key |

The launch command is detected from the project (`package.json` → `node <bin>`; Express dependency → `http://127.0.0.1:3000/mcp`; `pyproject.toml` → `uv --directory <dir> run server.py`). Use `--url` for a deployed server, `--name` to change the key, and `--force` to replace an existing entry. `--write` never touches a file it cannot parse as plain JSON.

## Architecture

```
src/
  cli.ts          CLI entry (commander)
  prompts.ts      Interactive prompts (@inquirer/prompts)
  templates.ts    Discover templates/ at runtime (sorted by template.json `order`)
  generator.ts    Copy template + replace placeholders
  clientConfig.ts Build/write MCP client config entries (`config` subcommand)
  postInstall.ts  Dependency install (npm/pnpm/yarn/bun, uv) + git init
scripts/
  e2e.mjs         Generate → install → build → connect with the MCP client, per template
templates/
  typescript-stdio-tool/
    template.json     metadata (description, language, transport, order)
    manifest.json     MCPB bundle manifest
    package.json      uses {{projectName}}, {{description}}, {{author}}
    src/index.ts      stdio MCP server with one example tool
    _gitignore        renamed to .gitignore on copy (npm strips real .gitignore)
```

### Adding a new template

1. Create `templates/<name>/`
2. Add a `template.json` with `{ "description": "...", "language": "typescript" | "python", "transport": "stdio" | "http", "order": <n> }`
3. Put real, runnable code inside — use `{{projectName}}`, `{{description}}`, `{{author}}` where you want substitution
4. Files eligible for placeholder replacement are selected by `PLACEHOLDER_EXTENSIONS` / `PLACEHOLDER_FILENAMES` in [generator.ts](src/generator.ts) — extend if needed
5. Use `_gitignore` instead of `.gitignore` (auto-renamed)
6. Add expectations for it in [scripts/e2e.mjs](scripts/e2e.mjs) and the template list in [tests/generator.test.ts](tests/generator.test.ts)

## CI

GitHub Actions workflows live at [.github/workflows/](.github/workflows/) — that's the only path GitHub recognizes; placing them anywhere else makes them inert.

- **[ci.yml](.github/workflows/ci.yml)** — runs `npm ci`, `npm run build`, `npm test`, and a CLI smoke test on Node 20/22 across Linux/Windows/macOS for every push and PR to `main`. An `e2e` job runs `npm run e2e`: every template is generated, installed, built, started and exercised over MCP (stdio and Streamable HTTP, Python via uv). Also runs the SDK pin check (non-blocking).
- **[sdk-bump.yml](.github/workflows/sdk-bump.yml)** — weekly cron + manual trigger that runs the Python sync script and opens a PR when `@modelcontextprotocol/sdk` has a new release.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to fork, modify, and use for personal, research, educational, or other noncommercial purposes. Commercial use requires a separate license from the author.

## Roadmap

- [x] Template: `typescript-stdio-resource`
- [x] Auto-install deps (`--install` / `--no-install`)
- [x] Auto-init git repo (`--git` / `--no-git`)
- [x] Project-name validation
- [x] CI workflows
- [x] More templates: `typescript-stdio-full`, `typescript-streamable-http` (replaces the planned `typescript-http-sse` — HTTP+SSE is deprecated in the spec), `python-stdio-tool`
- [x] Client config helper (`config` subcommand: Claude Desktop, Claude Code, Cursor, VS Code)
- [x] Migrate templates to `registerTool`/`registerResource`, zod 4
- [x] MCPB bundle manifest + MCP Inspector script in templates
- [x] Tests (vitest) + end-to-end run of every template over MCP
- [ ] `mcp add tool <name>` subcommand to extend an existing project
- [ ] `server.json` generation for the MCP Registry (`mcpName` in `package.json`)
- [ ] Auth example (OAuth) for the HTTP template
- [ ] Python Streamable HTTP template
- [ ] Publish to npm as `create-mcp-server` so `npm create mcp-server` works (note: the name is taken on npm — consider a scope)

## Design notes

- **Templates are real, runnable projects** with placeholders, not a DSL. Lower mental tax, easier to test, easier to contribute.
- **Placeholders are plain string tokens** (`{{projectName}}` etc.) placed only inside string literals, so template sources stay valid, type-checkable code.
- **`_gitignore` rename trick** — npm refuses to publish a real `.gitignore` inside a package, so templates ship the underscore form.
