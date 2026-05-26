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
- `-y, --yes` — accept all defaults (implies `--no-install`, `--no-git`)
- `--install` / `--no-install` — install deps after generate (auto-detects npm/pnpm/yarn/bun)
- `--git` / `--no-git` — `git init` + initial commit after generate

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

## CI

GitHub Actions workflows live at [.github/workflows/](.github/workflows/) — that's the only path GitHub recognizes; placing them anywhere else makes them inert.

- **[ci.yml](.github/workflows/ci.yml)** — runs `npm ci`, `npm run build`, `npm test`, and a CLI smoke test on Node 20/22 across Linux/Windows/macOS for every push and PR to `main`. Also runs the Python SDK pin check (non-blocking).
- **[sdk-bump.yml](.github/workflows/sdk-bump.yml)** — weekly cron + manual trigger that runs the Python sync script and opens a PR when `@modelcontextprotocol/sdk` has a new release.

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to fork, modify, and use for personal, research, educational, or other noncommercial purposes. Commercial use requires a separate license from the author.

## Roadmap

- [x] Template: `typescript-stdio-resource`
- [x] Auto-install deps (`--install` / `--no-install`)
- [x] Auto-init git repo (`--git` / `--no-git`)
- [x] Project-name validation
- [x] CI workflows
- [ ] More templates: `typescript-stdio-full`, `typescript-http-sse`, `python-stdio-tool`
- [ ] Helper to add Claude Desktop config entry
- [ ] `mcp add tool <name>` subcommand to extend an existing project
- [ ] Publish to npm as `create-mcp-server` so `npm create mcp-server` works
- [ ] Tests (vitest) — at minimum, generate each template into a tmpdir and run `tsc`

## Design notes

- **Templates are real, runnable projects** with placeholders, not a DSL. Lower mental tax, easier to test, easier to contribute.
- **Replacements are scoped** to `package.json`, `README.md`, `tsconfig.json` by default. Keep source files clean of template syntax so they stay valid TypeScript.
- **`_gitignore` rename trick** — npm refuses to publish a real `.gitignore` inside a package, so templates ship the underscore form.
