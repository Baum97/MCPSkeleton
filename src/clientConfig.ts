import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

/** MCP clients we know how to configure. */
export const CLIENTS = ['claude-desktop', 'claude-code', 'cursor', 'vscode'] as const;
export type ClientId = (typeof CLIENTS)[number];

export type LaunchSpec =
  | { kind: 'stdio'; command: string; args: string[] }
  | { kind: 'http'; url: string };

export interface ServerSpec {
  name: string;
  launch: LaunchSpec;
}

export interface EnvOptions {
  /** Defaults to `os.homedir()`. */
  homedir?: string;
  /** Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Directory for project-scoped configs (VS Code, Claude Code). Defaults to `process.cwd()`. */
  cwd?: string;
}

export interface ClientConfig {
  client: ClientId;
  /** Config file the entry belongs in. */
  file: string;
  /** Top-level key that holds the servers map (`mcpServers` or `servers`). */
  key: 'mcpServers' | 'servers';
  /** The entry to put under `<key>.<name>`. */
  entry: Record<string, unknown>;
  /** Optional one-line CLI alternative (Claude Code only). */
  command?: string;
  /** Extra hint for the user, if any. */
  note?: string;
}

export const DEFAULT_HTTP_URL = 'http://127.0.0.1:3000/mcp';

/** Strip an npm scope so `@me/foo` becomes `foo` — clients use the name as a key. */
function serverNameFrom(raw: string): string {
  return raw.replace(/^@[^/]+\//, '');
}

/**
 * Work out how to launch the MCP server living in `projectDir` by looking at
 * its project files. Pass `url` to describe a remote/HTTP server instead.
 */
export async function detectServer(
  projectDir: string,
  opts: { url?: string; name?: string } = {},
): Promise<ServerSpec> {
  const dir = path.resolve(projectDir);
  const pkgPath = path.join(dir, 'package.json');
  const pyprojectPath = path.join(dir, 'pyproject.toml');

  let name = opts.name ?? path.basename(dir);
  let launch: LaunchSpec | undefined;

  if (await fs.pathExists(pkgPath)) {
    const pkg = await fs.readJson(pkgPath);
    if (!opts.name && typeof pkg.name === 'string') name = pkg.name;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (opts.url || deps.express || deps.hono || deps.fastify) {
      launch = { kind: 'http', url: opts.url ?? DEFAULT_HTTP_URL };
    } else {
      const bin =
        typeof pkg.bin === 'string'
          ? pkg.bin
          : pkg.bin && typeof pkg.bin === 'object'
            ? (Object.values(pkg.bin)[0] as string | undefined)
            : undefined;
      const entry = bin ?? pkg.main ?? 'dist/index.js';
      launch = { kind: 'stdio', command: 'node', args: [path.join(dir, entry)] };
    }
  } else if (await fs.pathExists(pyprojectPath)) {
    if (!opts.name) {
      const match = /^name\s*=\s*"([^"]+)"/m.exec(await fs.readFile(pyprojectPath, 'utf8'));
      if (match) name = match[1];
    }
    launch = opts.url
      ? { kind: 'http', url: opts.url }
      : { kind: 'stdio', command: 'uv', args: ['--directory', dir, 'run', 'server.py'] };
  } else if (opts.url) {
    launch = { kind: 'http', url: opts.url };
  }

  if (!launch) {
    throw new Error(
      `No package.json or pyproject.toml in ${dir}. Pass --url to configure a remote server.`,
    );
  }
  return { name: serverNameFrom(name), launch };
}

export function claudeDesktopConfigPath(env: EnvOptions = {}): string {
  const home = env.homedir ?? os.homedir();
  const platform = env.platform ?? process.platform;
  const vars = env.env ?? process.env;
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (platform === 'win32') {
    const appData = vars.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
}

function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** Build the config entry for one client. Pure — does not touch the disk. */
export function buildClientConfig(
  client: ClientId,
  server: ServerSpec,
  env: EnvOptions = {},
): ClientConfig {
  const home = env.homedir ?? os.homedir();
  const cwd = env.cwd ?? process.cwd();
  const { name, launch } = server;

  switch (client) {
    case 'claude-desktop': {
      const file = claudeDesktopConfigPath(env);
      if (launch.kind === 'stdio') {
        return { client, file, key: 'mcpServers', entry: { command: launch.command, args: launch.args } };
      }
      // Claude Desktop's JSON config only launches local processes; bridge via mcp-remote.
      return {
        client,
        file,
        key: 'mcpServers',
        entry: { command: 'npx', args: ['-y', 'mcp-remote', launch.url] },
        note: 'Remote servers can also be added without a bridge under Settings → Connectors.',
      };
    }
    case 'cursor': {
      const file = path.join(home, '.cursor', 'mcp.json');
      const entry =
        launch.kind === 'stdio' ? { command: launch.command, args: launch.args } : { url: launch.url };
      return { client, file, key: 'mcpServers', entry };
    }
    case 'vscode': {
      const file = path.join(cwd, '.vscode', 'mcp.json');
      const entry =
        launch.kind === 'stdio'
          ? { type: 'stdio', command: launch.command, args: launch.args }
          : { type: 'http', url: launch.url };
      return { client, file, key: 'servers', entry };
    }
    case 'claude-code': {
      const file = path.join(cwd, '.mcp.json');
      if (launch.kind === 'stdio') {
        return {
          client,
          file,
          key: 'mcpServers',
          entry: { type: 'stdio', command: launch.command, args: launch.args, env: {} },
          command: ['claude', 'mcp', 'add', name, '--', launch.command, ...launch.args]
            .map(shellQuote)
            .join(' '),
        };
      }
      return {
        client,
        file,
        key: 'mcpServers',
        entry: { type: 'http', url: launch.url },
        command: ['claude', 'mcp', 'add', '--transport', 'http', name, launch.url]
          .map(shellQuote)
          .join(' '),
      };
    }
  }
}

/** Render the snippet a user would paste into the client's config file. */
export function renderSnippet(config: ClientConfig, name: string): string {
  return JSON.stringify({ [config.key]: { [name]: config.entry } }, null, 2);
}

/**
 * Merge the entry into the client's config file, creating it if needed.
 * Refuses to replace an existing entry with the same name unless `force`.
 */
export async function writeClientConfig(
  config: ClientConfig,
  name: string,
  opts: { force?: boolean } = {},
): Promise<'created' | 'updated'> {
  let existing: Record<string, unknown> = {};
  const exists = await fs.pathExists(config.file);
  if (exists) {
    const raw = await fs.readFile(config.file, 'utf8');
    if (raw.trim()) {
      try {
        existing = JSON.parse(raw);
      } catch {
        throw new Error(
          `${config.file} is not plain JSON (comments?). Add the snippet by hand instead.`,
        );
      }
    }
  }

  const servers = (existing[config.key] ?? {}) as Record<string, unknown>;
  if (servers[name] !== undefined && !opts.force) {
    throw new Error(
      `"${name}" already exists in ${config.file}. Re-run with --force to replace it.`,
    );
  }
  servers[name] = config.entry;
  existing[config.key] = servers;

  await fs.ensureDir(path.dirname(config.file));
  await fs.writeFile(config.file, JSON.stringify(existing, null, 2) + '\n');
  return exists ? 'updated' : 'created';
}
