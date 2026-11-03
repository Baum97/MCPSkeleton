import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { generate, toPackageName } from '../src/generator.js';
import { DEFAULT_TEMPLATE, listTemplates } from '../src/templates.js';
import type { Answers } from '../src/prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tmpRoot: string;
let prevCwd: string;

beforeEach(async () => {
  prevCwd = process.cwd();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-skel-test-'));
  process.chdir(tmpRoot);
});

afterEach(async () => {
  process.chdir(prevCwd);
  await fs.remove(tmpRoot);
});

const baseAnswers = (overrides: Partial<Answers>): Answers => ({
  directory: 'out',
  projectName: 'out',
  description: 'A test MCP server.',
  author: 'Test Author',
  template: 'typescript-stdio-tool',
  install: false,
  git: false,
  ...overrides,
});

const TS_TEMPLATES = [
  'typescript-stdio-tool',
  'typescript-stdio-resource',
  'typescript-stdio-full',
  'typescript-streamable-http',
];
const ALL_TEMPLATES = [...TS_TEMPLATES, 'python-stdio-tool', 'python-streamable-http'];

describe('toPackageName', () => {
  it.each([
    ['my-server', 'my_server'],
    ['mcp.server', 'mcp_server'],
    ['@me/foo-bar', 'foo_bar'],
    ['1st', '_1st'],
  ])('%s → %s', (input, expected) => {
    expect(toPackageName(input)).toBe(expected);
  });
});

describe('listTemplates', () => {
  it('finds every shipped template, ordered, with metadata', async () => {
    const templates = await listTemplates();
    expect(templates.map((t) => t.name)).toEqual(ALL_TEMPLATES);
    expect(templates[0].name).toBe(DEFAULT_TEMPLATE);
    for (const t of templates) {
      expect(t.description.length).toBeGreaterThan(0);
    }
    const byName = Object.fromEntries(templates.map((t) => [t.name, t]));
    expect(byName['python-stdio-tool'].language).toBe('python');
    expect(byName['python-streamable-http']).toMatchObject({ language: 'python', transport: 'http' });
    expect(byName['typescript-streamable-http'].transport).toBe('http');
    expect(byName['typescript-stdio-tool']).toMatchObject({ language: 'typescript', transport: 'stdio' });
  });
});

describe('generate', () => {
  it.each(TS_TEMPLATES)(
    'scaffolds %s with placeholders replaced',
    async (template) => {
      const answers = baseAnswers({
        directory: 'my-srv',
        projectName: 'my-srv',
        template,
      });
      await generate(answers);

      const outDir = path.join(tmpRoot, 'my-srv');
      const pkgPath = path.join(outDir, 'package.json');
      const srcPath = path.join(outDir, 'src/index.ts');

      expect(await fs.pathExists(pkgPath)).toBe(true);
      expect(await fs.pathExists(srcPath)).toBe(true);
      expect(await fs.pathExists(path.join(outDir, '.gitignore'))).toBe(true);
      expect(await fs.pathExists(path.join(outDir, '_gitignore'))).toBe(false);
      expect(await fs.pathExists(path.join(outDir, 'template.json'))).toBe(false);

      const pkg = await fs.readJson(pkgPath);
      expect(pkg.name).toBe('my-srv');
      expect(pkg.description).toBe('A test MCP server.');
      expect(pkg.author).toBe('Test Author');
      expect(pkg.dependencies['@modelcontextprotocol/sdk']).toMatch(/^\^/);
    },
  );

  it('scaffolds python-stdio-tool with placeholders replaced', async () => {
    await generate(baseAnswers({ directory: 'py-srv', projectName: 'py-srv', template: 'python-stdio-tool' }));
    const outDir = path.join(tmpRoot, 'py-srv');
    const pyproject = await fs.readFile(path.join(outDir, 'pyproject.toml'), 'utf8');
    expect(pyproject).toContain('name = "py-srv"');
    expect(pyproject).toMatch(/"mcp>=2/);
    expect(pyproject).toContain('py-srv = "py_srv.server:main"');
    expect(pyproject).toContain('packages = ["src/py_srv"]');
    expect(await fs.pathExists(path.join(outDir, 'src/__packageName__'))).toBe(false);
    const server = await fs.readFile(path.join(outDir, 'src/py_srv/server.py'), 'utf8');
    expect(server).toContain('MCPServer("py-srv")');
    expect(server).not.toContain('fastmcp');
    expect(await fs.pathExists(path.join(outDir, '.gitignore'))).toBe(true);
  });

  it.each(ALL_TEMPLATES)('leaves no placeholder tokens anywhere in %s', async (template) => {
    await generate(baseAnswers({ directory: 'clean', projectName: 'clean', template }));
    const walk = async (dir: string): Promise<string[]> => {
      const out: string[] = [];
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        out.push(...(e.isDirectory() ? await walk(full) : [full]));
      }
      return out;
    };
    for (const file of await walk(path.join(tmpRoot, 'clean'))) {
      expect(await fs.readFile(file, 'utf8'), file).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
    }
  });

  it.each(['typescript-stdio-tool', 'typescript-stdio-resource', 'typescript-stdio-full'])(
    'ships a valid-looking MCPB manifest in %s',
    async (template) => {
      await generate(baseAnswers({ directory: 'bundle', projectName: 'bundle', template }));
      const manifest = await fs.readJson(path.join(tmpRoot, 'bundle/manifest.json'));
      expect(manifest).toMatchObject({
        manifest_version: '0.3',
        name: 'bundle',
        author: { name: 'Test Author' },
        server: { type: 'node', entry_point: 'dist/index.js' },
      });
      expect(manifest.server.mcp_config.args).toEqual(['${__dirname}/dist/index.js']);
    },
  );

  it('does not use deprecated McpServer.tool()/.resource() helpers', async () => {
    for (const template of TS_TEMPLATES) {
      const src = await fs.readFile(
        path.join(__dirname, '../templates', template, 'src/index.ts'),
        'utf8',
      );
      expect(src, template).not.toMatch(/server\.(tool|resource|prompt)\(/);
    }
  });

  it('substitutes placeholders inside src/*.ts files', async () => {
    await generate(baseAnswers({ directory: 'srv-a', projectName: 'srv-a' }));
    const src = await fs.readFile(path.join(tmpRoot, 'srv-a/src/index.ts'), 'utf8');
    expect(src).not.toContain('{{projectName}}');
    expect(src).toContain("name: 'srv-a'");
  });

  it('leaves no placeholder tokens in package.json or README.md', async () => {
    await generate(baseAnswers({ directory: 'srv-b', projectName: 'srv-b' }));
    for (const file of ['package.json', 'README.md', 'tsconfig.json']) {
      const content = await fs.readFile(path.join(tmpRoot, 'srv-b', file), 'utf8');
      expect(content).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
    }
  });

  it('refuses to write into a non-empty directory', async () => {
    const dir = path.join(tmpRoot, 'taken');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'sentinel'), 'hi');

    await expect(
      generate(baseAnswers({ directory: 'taken', projectName: 'taken' })),
    ).rejects.toThrow(/not empty/);
  });

  it('throws on unknown template', async () => {
    await expect(
      generate(baseAnswers({ template: 'does-not-exist' })),
    ).rejects.toThrow(/not found/);
  });
});
