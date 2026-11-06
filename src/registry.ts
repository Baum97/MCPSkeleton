import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import { detectServer, readPyproject } from './clientConfig.js';

/** server.json schema version written by `registry`. */
export const SERVER_SCHEMA_URL =
  'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

const NAME_RE = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;
const DESCRIPTION_MAX = 100;

export interface RegistryOptions {
  /** Reverse-DNS namespace, e.g. `io.github.baum97`. Detected from the GitHub remote if omitted. */
  namespace?: string;
  /** Public URL of a deployed Streamable HTTP server. */
  url?: string;
  /** Overwrite an existing server.json. */
  force?: boolean;
}

export interface RegistryResult {
  file: string;
  serverName: string;
  serverJson: Record<string, unknown>;
  /** Other files changed to prove package ownership. */
  updated: string[];
  notes: string[];
}

/** `https://github.com/User/Repo(.git)` or `git@github.com:User/Repo.git` → `{ owner, repo }`. */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const m = /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/.exec(url);
  return m ? { owner: m[1], repo: m[2] } : null;
}

function gitRemote(dir: string): string | undefined {
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

export async function createServerJson(
  projectDir: string,
  opts: RegistryOptions = {},
): Promise<RegistryResult> {
  const dir = path.resolve(projectDir);
  const file = path.join(dir, 'server.json');
  if ((await fs.pathExists(file)) && !opts.force) {
    throw new Error(`${file} already exists. Re-run with --force to regenerate it.`);
  }

  const pkgPath = path.join(dir, 'package.json');
  const isNode = await fs.pathExists(pkgPath);
  const isPython = !isNode && (await fs.pathExists(path.join(dir, 'pyproject.toml')));
  if (!isNode && !isPython) {
    throw new Error(`No package.json or pyproject.toml in ${dir}.`);
  }

  const pkg = isNode ? await fs.readJson(pkgPath) : undefined;
  const py = isPython ? await readPyproject(dir) : undefined;
  const packageName: string | undefined = pkg?.name ?? py?.name;
  const version: string | undefined = pkg?.version ?? py?.version;
  let description: string = pkg?.description ?? py?.description ?? '';
  if (!packageName || !version) throw new Error('Project has no name or version.');

  // Repository + namespace
  const repoUrl: string | undefined =
    (typeof pkg?.repository === 'string' ? pkg.repository : pkg?.repository?.url) ?? gitRemote(dir);
  const gh = repoUrl ? parseGitHubUrl(repoUrl) : null;
  const namespace = opts.namespace ?? (gh ? `io.github.${gh.owner}` : undefined);
  if (!namespace) {
    throw new Error(
      'Could not detect a GitHub remote. Pass --namespace (e.g. io.github.<your-github-user>).',
    );
  }
  const serverName = `${namespace}/${packageName.replace(/^@[^/]+\//, '')}`;
  if (!NAME_RE.test(serverName)) {
    throw new Error(`"${serverName}" is not a valid registry name (expected namespace/name).`);
  }

  const notes: string[] = [];
  if (!description.trim()) description = `MCP server ${packageName}`;
  if (description.length > DESCRIPTION_MAX) {
    description = description.slice(0, DESCRIPTION_MAX - 1).trimEnd() + '…';
    notes.push(`Description shortened to ${DESCRIPTION_MAX} characters (registry limit).`);
  }

  const launch = (await detectServer(dir)).launch;
  const isHttp = launch.kind === 'http';
  if (isHttp && !opts.url) {
    throw new Error(
      'This is an HTTP server. Deploy it first, then pass its public URL with --url https://…/mcp.',
    );
  }

  const serverJson: Record<string, unknown> = {
    $schema: SERVER_SCHEMA_URL,
    name: serverName,
    description,
    version,
  };
  if (gh) serverJson.repository = { url: `https://github.com/${gh.owner}/${gh.repo}`, source: 'github' };
  if (opts.url) serverJson.remotes = [{ type: 'streamable-http', url: opts.url }];
  if (!isHttp) {
    serverJson.packages = [
      isNode
        ? { registryType: 'npm', identifier: packageName, version, transport: { type: 'stdio' } }
        : {
            registryType: 'pypi',
            identifier: packageName,
            version,
            runtimeHint: 'uvx',
            transport: { type: 'stdio' },
          },
    ];
  }

  // Ownership proof the registry checks against the published package.
  const updated: string[] = [];
  if (isNode && !isHttp) {
    if (pkg.mcpName !== serverName) {
      pkg.mcpName = serverName;
      await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      updated.push(pkgPath);
    }
    notes.push('Publish to npm first (the registry checks "mcpName" in the published package.json).');
  } else if (isPython && !isHttp) {
    const readme = path.join(dir, 'README.md');
    const marker = `<!-- mcp-name: ${serverName} -->`;
    const text = (await fs.pathExists(readme)) ? await fs.readFile(readme, 'utf8') : '';
    if (!text.includes(marker)) {
      const cleaned = text.replace(/^<!-- mcp-name: .* -->\n?/m, '');
      await fs.writeFile(readme, cleaned.replace(/\n*$/, '\n') + `\n${marker}\n`);
      updated.push(readme);
    }
    notes.push('Publish to PyPI first (the registry checks the "mcp-name:" line in the README).');
  }
  if (namespace.startsWith('io.github.')) {
    notes.push(`"${namespace}" must match the GitHub account you log in with: mcp-publisher login github`);
  }
  notes.push('Then run: mcp-publisher publish');

  await fs.writeFile(file, JSON.stringify(serverJson, null, 2) + '\n');
  return { file, serverName, serverJson, updated, notes };
}
