import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { addPrimitive } from '../src/add.js';
import { generate } from '../src/generator.js';
import type { Answers } from '../src/prompts.js';

let tmp: string;
let prevCwd: string;

beforeEach(async () => {
  prevCwd = process.cwd();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-skel-add-'));
  process.chdir(tmp);
});

afterEach(async () => {
  process.chdir(prevCwd);
  await fs.remove(tmp);
});

const scaffold = (template: string, directory = 'srv') =>
  generate({
    directory,
    projectName: directory,
    description: 'x',
    author: '',
    template,
    install: false,
    git: false,
  } satisfies Answers);

describe('addPrimitive (TypeScript)', () => {
  it('inserts a tool above the marker and lists it in manifest.json', async () => {
    await scaffold('typescript-stdio-tool');
    const res = await addPrimitive('srv', 'tool', 'search-docs', { description: "Find a doc's text" });
    const src = await fs.readFile(res.file, 'utf8');

    expect(src).toContain("server.registerTool(\n  'search-docs',");
    expect(src).toContain("description: 'Find a doc\\'s text'");
    expect(src.indexOf("'search-docs'")).toBeLessThan(src.indexOf('create-mcp-server:add'));
    expect(src.indexOf('create-mcp-server:add')).toBeLessThan(src.indexOf('async function main'));

    const manifest = await fs.readJson(path.join(tmp, 'srv/manifest.json'));
    expect(manifest.tools.map((t: { name: string }) => t.name)).toEqual(['echo', 'search-docs']);
  });

  it('adds the zod import and dependency when the project lacks them', async () => {
    await scaffold('typescript-stdio-resource');
    const res = await addPrimitive('srv', 'prompt', 'summarize');
    const src = await fs.readFile(res.file, 'utf8');
    expect(src).toMatch(/^import \{ z \} from 'zod';$/m);
    expect(src).toContain("server.registerPrompt(\n  'summarize',");

    const pkg = await fs.readJson(path.join(tmp, 'srv/package.json'));
    expect(pkg.dependencies.zod).toBeDefined();
    expect(res.alsoUpdated).toContain(path.join(tmp, 'srv/package.json'));

    const manifest = await fs.readJson(path.join(tmp, 'srv/manifest.json'));
    expect(manifest.prompts[0]).toMatchObject({ name: 'summarize', text: expect.any(String) });
  });

  it('adds resources with a default or custom URI', async () => {
    await scaffold('typescript-stdio-tool');
    await addPrimitive('srv', 'resource', 'config');
    await addPrimitive('srv', 'resource', 'readme', { uri: 'file:///README.md' });
    const src = await fs.readFile(path.join(tmp, 'srv/src/index.ts'), 'utf8');
    expect(src).toContain("'data://config'");
    expect(src).toContain("'file:///README.md'");
  });

  it('indents code inside buildServer() of the HTTP template', async () => {
    await scaffold('typescript-streamable-http');
    await addPrimitive('srv', 'tool', 'ping');
    const src = await fs.readFile(path.join(tmp, 'srv/src/index.ts'), 'utf8');
    expect(src).toContain("  server.registerTool(\n    'ping',");
    expect(src.indexOf("'ping'")).toBeLessThan(src.indexOf('  return server;'));
  });

  it('falls back to `async function main` when the marker is missing', async () => {
    await scaffold('typescript-stdio-tool');
    const file = path.join(tmp, 'srv/src/index.ts');
    await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(/^.*create-mcp-server:add.*$/m, ''));
    await addPrimitive('srv', 'tool', 'legacy');
    const src = await fs.readFile(file, 'utf8');
    expect(src.indexOf("'legacy'")).toBeLessThan(src.indexOf('async function main'));
  });

  it('rejects duplicates and invalid names', async () => {
    await scaffold('typescript-stdio-tool');
    await expect(addPrimitive('srv', 'tool', 'echo')).rejects.toThrow(/already exists/);
    await expect(addPrimitive('srv', 'tool', '1bad')).rejects.toThrow(/Invalid name/);
    await expect(addPrimitive('srv', 'tool', "x'); evil();//")).rejects.toThrow(/Invalid name/);
    await expect(addPrimitive('srv', 'widget' as 'tool', 'x')).rejects.toThrow(/Unknown kind/);
  });
});

describe('addPrimitive (Python)', () => {
  it('adds a decorated function, keeping hyphenated MCP names', async () => {
    await scaffold('python-stdio-tool');
    const res = await addPrimitive('srv', 'tool', 'fetch-page', { description: 'Fetch a page' });
    expect(res.file).toBe(path.join(tmp, 'srv/src/srv/server.py'));
    const src = await fs.readFile(res.file, 'utf8');
    expect(src).toContain('@mcp.tool(name="fetch-page")\ndef fetch_page(input: str) -> str:\n    """Fetch a page"""');
    expect(src.indexOf('def fetch_page')).toBeLessThan(src.indexOf('def main'));
    await expect(addPrimitive('srv', 'tool', 'fetch_page')).rejects.toThrow(/already exists/);
  });

  it('adds resources and prompts', async () => {
    await scaffold('python-streamable-http');
    await addPrimitive('srv', 'resource', 'status');
    await addPrimitive('srv', 'prompt', 'plan');
    const src = await fs.readFile(path.join(tmp, 'srv/src/srv/server.py'), 'utf8');
    expect(src).toContain('@mcp.resource("data://status")\ndef status() -> str:');
    expect(src).toContain('@mcp.prompt()\ndef plan(topic: str) -> str:');
  });
});

it('fails outside a generated project', async () => {
  await expect(addPrimitive('.', 'tool', 'x')).rejects.toThrow(/No src\/index.ts or server.py/);
});
