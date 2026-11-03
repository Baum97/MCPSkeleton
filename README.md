# @baum97/create-mcp-server

Scaffold a Model Context Protocol server in seconds. Like `create-react-app`, but for MCP — and it stays useful after the first minute: add tools, connect clients and publish to the MCP Registry from the same CLI.

```bash
npm create @baum97/mcp-server@latest my-server
# or
npx @baum97/create-mcp-server my-server
```

Commands below are written as `create-mcp-server …` — that is the binary after `npm i -g @baum97/create-mcp-server`; without installing, use `npx @baum97/create-mcp-server …`.

| Command | What it does |
|---|---|
| `create-mcp-server [dir]` | generate a new server from a template |
| `create-mcp-server add <tool\|resource\|prompt> <name>` | add a stub to an existing server (TypeScript or Python) |
| `create-mcp-server config [dir] --client <client>` | print or write the config for Claude Desktop, Claude Code, Cursor, VS Code |
| `create-mcp-server registry [dir]` | write `server.json` for the official MCP Registry |

## Templates

| Template | Language | Transport | What you get |
|---|---|---|---|
| `typescript-stdio-tool` *(default)* | TypeScript | stdio | one example tool — the minimal starting point |
| `typescript-stdio-resource` | TypeScript | stdio | a static and a templated resource |
| `typescript-stdio-full` | TypeScript | stdio | tools with structured output, listable resources with completion, prompts |
| `typescript-streamable-http` | TypeScript | Streamable HTTP | stateless Express server, health check, Dockerfile — for remote deployment |
| `python-stdio-tool` | Python | stdio | `mcp` 2.x `MCPServer` with tool/resource/prompt, packaged for `uvx`, managed with [uv](https://docs.astral.sh/uv/) |
| `python-streamable-http` | Python | Streamable HTTP | stateless `MCPServer`, health check, Dockerfile |

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

## Add tools, resources and prompts

```bash
create-mcp-server add tool search-docs --description "Search the docs"   # in the project dir
create-mcp-server add resource config --uri config://app -d path/to/server
create-mcp-server add prompt summarize
```

Inserts a typed, compilable stub at the `create-mcp-server:add` marker (falls back to `async function main` / `return server;` / `def main` in older projects), adds the zod import and dependency if missing, and keeps the MCPB `manifest.json` in sync. Python names with `-` become `snake_case` functions with an explicit MCP `name=`.

## Publish to the MCP Registry

```bash
create-mcp-server registry .                                  # stdio server on npm / PyPI
create-mcp-server registry . --url https://mcp.example.com/mcp   # deployed HTTP server
```

Writes a `server.json` (validated against the official schema in the tests) with the namespace taken from your GitHub remote (`io.github.<user>/<name>`, override with `--namespace`), and adds the ownership proof the registry checks: `"mcpName"` in `package.json` for npm, an `<!-- mcp-name: … -->` line in the README for PyPI. Then publish the package and run `mcp-publisher publish`.

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

The launch command is detected from the project (`package.json` → `node <bin>`; Express dependency or Python `streamable-http` → `http://127.0.0.1:3000/mcp`; `pyproject.toml` → `uv --directory <dir> run <script>`). Use `--url` for a deployed server, `--name` to change the key, and `--force` to replace an existing entry. `--write` never touches a file it cannot parse as plain JSON.

## Architecture

```
src/
  cli.ts          CLI entry (commander)
  prompts.ts      Interactive prompts (@inquirer/prompts)
  templates.ts    Discover templates/ at runtime (sorted by template.json `order`)
  generator.ts    Copy template + replace placeholders
  clientConfig.ts Build/write MCP client config entries (`config` subcommand)
  add.ts          Insert tool/resource/prompt stubs (`add` subcommand)
  registry.ts     Generate server.json + ownership proof (`registry` subcommand)
  meta.ts         Package name/version from package.json
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
3. Put real, runnable code inside — use `{{projectName}}`, `{{packageName}}` (Python-safe), `{{description}}`, `{{author}}` where you want substitution; name a file or directory `__packageName__` to have it renamed
4. Put a `create-mcp-server:add` comment where `add` should insert new code
5. Files eligible for placeholder replacement are selected by `PLACEHOLDER_EXTENSIONS` / `PLACEHOLDER_FILENAMES` in [generator.ts](src/generator.ts) — extend if needed
6. Use `_gitignore` instead of `.gitignore` (auto-renamed)
7. Add expectations for it in [scripts/e2e.mjs](scripts/e2e.mjs) and the template list in [tests/generator.test.ts](tests/generator.test.ts)

## CI

GitHub Actions workflows live at [.github/workflows/](.github/workflows/) — that's the only path GitHub recognizes; placing them anywhere else makes them inert.

- **[ci.yml](.github/workflows/ci.yml)** — runs `npm ci`, `npm run build`, `npm test`, and a CLI smoke test on Node 20/22 across Linux/Windows/macOS for every push and PR to `main`. An `e2e` job runs `npm run e2e`: every template is generated, installed, built, started and exercised over MCP (stdio and Streamable HTTP, Python via uv). Also runs the SDK pin check (non-blocking).
- **[release.yml](.github/workflows/release.yml)** — on a `v*` tag: build, unit + e2e tests, then `npm publish --provenance` and a GitHub release. Needs the `NPM_TOKEN` secret. Release with `npm version patch && git push --follow-tags`.
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
- [x] `add tool|resource|prompt <name>` subcommand to extend an existing project
- [x] `registry` subcommand: `server.json` + ownership proof for the MCP Registry
- [x] Python Streamable HTTP template; Python templates packaged for `uvx`
- [x] Release workflow → npm as `@baum97/create-mcp-server` (`npm create @baum97/mcp-server`)
- [ ] First npm release (needs the `NPM_TOKEN` secret)
- [ ] Auth example (OAuth) for the HTTP templates
- [ ] Interactive `add` (prompt for argument names/types)

## Design notes

- **Templates are real, runnable projects** with placeholders, not a DSL. Lower mental tax, easier to test, easier to contribute.
- **Placeholders are plain string tokens** (`{{projectName}}` etc.) placed only inside string literals, so template sources stay valid, type-checkable code.
- **`_gitignore` rename trick** — npm refuses to publish a real `.gitignore` inside a package, so templates ship the underscore form.
