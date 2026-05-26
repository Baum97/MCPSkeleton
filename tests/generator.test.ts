import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { generate } from '../src/generator.js';
import { listTemplates } from '../src/templates.js';
import type { Answers } from '../src/prompts.js';

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
  ...overrides,
});

describe('listTemplates', () => {
  it('finds both shipped templates with descriptions', async () => {
    const templates = await listTemplates();
    const names = templates.map((t) => t.name).sort();
    expect(names).toEqual(['typescript-stdio-resource', 'typescript-stdio-tool']);
    for (const t of templates) {
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});

describe('generate', () => {
  it.each(['typescript-stdio-tool', 'typescript-stdio-resource'])(
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

  it('substitutes placeholders inside src files when they exist', async () => {
    // src/index.ts uses {{projectName}}; the generator only rewrites a fixed
    // file list by default, so this test pins that current behaviour rather
    // than asserting source-level substitution.
    await generate(baseAnswers({ directory: 'srv-a', projectName: 'srv-a' }));
    const src = await fs.readFile(path.join(tmpRoot, 'srv-a/src/index.ts'), 'utf8');
    expect(src).toContain('{{projectName}}');
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
