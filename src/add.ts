import fs from 'fs-extra';
import path from 'node:path';
import { findPythonServer } from './clientConfig.js';

export const ADD_KINDS = ['tool', 'resource', 'prompt'] as const;
export type AddKind = (typeof ADD_KINDS)[number];

export interface AddOptions {
  description?: string;
  /** Resource URI. Defaults to `data://<name>`. */
  uri?: string;
}

export interface AddResult {
  /** Source file that was edited. */
  file: string;
  /** Other files touched (package.json, manifest.json). */
  alsoUpdated: string[];
  /** Follow-up hints for the user. */
  notes: string[];
}

/** Line that marks where `add` inserts code; kept in every template. */
export const ADD_MARKER = 'create-mcp-server:add';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

function titleFrom(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const tsString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const pyString = (s: string) => JSON.stringify(s);

function indent(block: string, prefix: string): string {
  return block
    .split('\n')
    .map((line) => (line ? prefix + line : line))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

function tsSnippet(kind: AddKind, name: string, description: string, uri: string): string {
  const title = tsString(titleFrom(name));
  const desc = tsString(description);
  switch (kind) {
    case 'tool':
      return `server.registerTool(
  ${tsString(name)},
  {
    title: ${title},
    description: ${desc},
    inputSchema: { input: z.string().describe('TODO: describe this argument') },
  },
  async ({ input }) => ({
    content: [{ type: 'text', text: \`TODO: implement ${name} (got \${input})\` }],
  }),
);
`;
    case 'resource':
      return `server.registerResource(
  ${tsString(name)},
  ${tsString(uri)},
  { title: ${title}, description: ${desc}, mimeType: 'text/plain' },
  async (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'text/plain', text: 'TODO: content of ${name}' }],
  }),
);
`;
    case 'prompt':
      return `server.registerPrompt(
  ${tsString(name)},
  {
    title: ${title},
    description: ${desc},
    argsSchema: { topic: z.string().describe('TODO: describe this argument') },
  },
  ({ topic }) => ({
    messages: [
      { role: 'user', content: { type: 'text', text: \`TODO: ${name} prompt about \${topic}\` } },
    ],
  }),
);
`;
  }
}

function pySnippet(kind: AddKind, name: string, ident: string, description: string, uri: string): string {
  const doc = description.replace(/"""/g, '\\"\\"\\"');
  // Python derives the MCP name from the function name; pass it explicitly when they differ.
  const nameArg = ident === name ? '' : `name=${pyString(name)}`;
  switch (kind) {
    case 'tool':
      return `@mcp.tool(${nameArg})
def ${ident}(input: str) -> str:
    """${doc}"""
    # TODO: implement
    return f"TODO: implement ${name} (got {input})"
`;
    case 'resource':
      return `@mcp.resource(${pyString(uri)}${nameArg ? `, ${nameArg}` : ''})
def ${ident}() -> str:
    """${doc}"""
    return "TODO: content of ${name}"
`;
    case 'prompt':
      return `@mcp.prompt(${nameArg})
def ${ident}(topic: str) -> str:
    """${doc}"""
    return f"TODO: ${name} prompt about {topic}"
`;
  }
}

// ---------------------------------------------------------------------------
// Insertion
// ---------------------------------------------------------------------------

/**
 * Index of the line to insert above, plus that line's indentation. Prefers the
 * explicit marker, then falls back to well-known anchors in older projects.
 */
function findAnchor(lines: string[], fallbacks: RegExp[]): { index: number; indent: string } | null {
  for (const re of [new RegExp(`(#|//)\\s*${ADD_MARKER}`), ...fallbacks]) {
    const index = lines.findIndex((l) => re.test(l));
    if (index !== -1) return { index, indent: /^\s*/.exec(lines[index])![0] };
  }
  return null;
}

function insertAbove(source: string, snippet: string, fallbacks: RegExp[]): string {
  const lines = source.split('\n');
  const anchor = findAnchor(lines, fallbacks);
  if (!anchor) {
    throw new Error(
      `Could not find where to insert. Add a line containing "// ${ADD_MARKER}" (or "# ${ADD_MARKER}") where new code should go.`,
    );
  }
  const block = indent(snippet, anchor.indent).split('\n');
  lines.splice(anchor.index, 0, ...block);
  return lines.join('\n');
}

async function updateManifest(
  dir: string,
  kind: AddKind,
  name: string,
  description: string,
): Promise<string | null> {
  const file = path.join(dir, 'manifest.json');
  if (kind === 'resource' || !(await fs.pathExists(file))) return null;
  const manifest = await fs.readJson(file);
  const key = kind === 'tool' ? 'tools' : 'prompts';
  const list: Record<string, unknown>[] = manifest[key] ?? [];
  if (list.some((e) => e.name === name)) return null;
  list.push(
    kind === 'tool'
      ? { name, description }
      : { name, description, arguments: ['topic'], text: `TODO: ${name} prompt about \${arguments.topic}` },
  );
  manifest[key] = list;
  await fs.writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  return file;
}

export async function addPrimitive(
  projectDir: string,
  kind: AddKind,
  name: string,
  opts: AddOptions = {},
): Promise<AddResult> {
  if (!(ADD_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Unknown kind "${kind}". Choose one of: ${ADD_KINDS.join(', ')}.`);
  }
  if (!NAME_RE.test(name)) {
    throw new Error(
      `Invalid name "${name}". Use letters, digits, "-" and "_", starting with a letter.`,
    );
  }

  const dir = path.resolve(projectDir);
  const description = opts.description ?? `TODO: describe ${name}`;
  const uri = opts.uri ?? `data://${name}`;
  const tsFile = path.join(dir, 'src', 'index.ts');
  const pyFile = await findPythonServer(dir);
  const notes: string[] = [];
  const alsoUpdated: string[] = [];

  if (await fs.pathExists(tsFile)) {
    let src = await fs.readFile(tsFile, 'utf8');
    const fn = { tool: 'registerTool', resource: 'registerResource', prompt: 'registerPrompt' }[kind];
    const legacy = { tool: 'tool', resource: 'resource', prompt: 'prompt' }[kind];
    const dupe = new RegExp(`\\.(${fn}|${legacy})\\(\\s*['"\`]${name}['"\`]`);
    if (dupe.test(src)) throw new Error(`A ${kind} named "${name}" already exists in ${tsFile}.`);

    src = insertAbove(src, tsSnippet(kind, name, description, uri), [
      /^\s*return server;/,
      /^async function main\(/,
    ]);

    if (kind !== 'resource' && !/from ['"]zod(\/v4)?['"]/.test(src)) {
      const lines = src.split('\n');
      let lastImport = -1;
      lines.forEach((l, i) => {
        if (/^import\s/.test(l)) lastImport = i;
      });
      lines.splice(lastImport + 1, 0, "import { z } from 'zod';");
      src = lines.join('\n');

      const pkgPath = path.join(dir, 'package.json');
      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJson(pkgPath);
        if (!pkg.dependencies?.zod) {
          pkg.dependencies = { ...pkg.dependencies, zod: '^4.1.0' };
          await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
          alsoUpdated.push(pkgPath);
          notes.push('Added zod to dependencies — run your package manager\'s install.');
        }
      }
    }

    await fs.writeFile(tsFile, src);
    const manifest = await updateManifest(dir, kind, name, description);
    if (manifest) alsoUpdated.push(manifest);
    notes.push('Fill in the TODOs, then rebuild.');
    return { file: tsFile, alsoUpdated, notes };
  }

  if (pyFile) {
    const ident = name.replace(/-/g, '_');
    let src = await fs.readFile(pyFile, 'utf8');
    if (new RegExp(`^def ${ident}\\(`, 'm').test(src)) {
      throw new Error(`A function named "${ident}" already exists in ${pyFile}.`);
    }
    src = insertAbove(src, pySnippet(kind, name, ident, description, uri) + '\n', [
      /^def main\(/,
      /^if __name__ == /,
    ]);
    await fs.writeFile(pyFile, src);
    notes.push('Fill in the TODOs. Type hints become the input schema.');
    return { file: pyFile, alsoUpdated, notes };
  }

  throw new Error(`No src/index.ts or server.py in ${dir} — is this a generated MCP server?`);
}
