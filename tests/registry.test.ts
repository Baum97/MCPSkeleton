import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { createServerJson, parseGitHubUrl } from '../src/registry.js';
import { generate } from '../src/generator.js';
import type { Answers } from '../src/prompts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readJsonSync(path.join(here, 'fixtures/server.schema.json'));
const addFormats = addFormatsModule as unknown as (ajv: Ajv) => Ajv;
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

let tmp: string;
let prevCwd: string;

beforeEach(async () => {
  prevCwd = process.cwd();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-skel-reg-'));
  process.chdir(tmp);
});

afterEach(async () => {
  process.chdir(prevCwd);
  await fs.remove(tmp);
});

const scaffold = (template: string, description = 'Does useful things') =>
  generate({
    directory: 'srv',
    projectName: 'srv',
    description,
    author: '',
    template,
    install: false,
    git: false,
  } satisfies Answers);

const expectValid = (json: unknown) => {
  const ok = validate(json);
  expect(validate.errors ?? [], JSON.stringify(validate.errors)).toEqual([]);
  expect(ok).toBe(true);
};

describe('parseGitHubUrl', () => {
  it.each([
    ['https://github.com/Baum97/MCPSkeleton', 'Baum97', 'MCPSkeleton'],
    ['git+https://github.com/Baum97/MCPSkeleton.git', 'Baum97', 'MCPSkeleton'],
    ['git@github.com:me/thing.git', 'me', 'thing'],
  ])('%s', (url, owner, repo) => {
    expect(parseGitHubUrl(url)).toEqual({ owner, repo });
  });
  it('ignores non-GitHub URLs', () => {
    expect(parseGitHubUrl('https://gitlab.com/a/b')).toBeNull();
  });
});

describe('createServerJson', () => {
  it('npm stdio server: valid server.json + mcpName ownership proof', async () => {
    await scaffold('typescript-stdio-tool');
    const res = await createServerJson('srv', { namespace: 'io.github.baum97' });

    expectValid(res.serverJson);
    expect(res.serverJson).toMatchObject({
      name: 'io.github.baum97/srv',
      version: '0.1.0',
      packages: [{ registryType: 'npm', identifier: 'srv', version: '0.1.0', transport: { type: 'stdio' } }],
    });
    expect((await fs.readJson(path.join(tmp, 'srv/package.json'))).mcpName).toBe('io.github.baum97/srv');
    expect(await fs.readJson(path.join(tmp, 'srv/server.json'))).toEqual(res.serverJson);
  });

  it('derives namespace and repository from package.json', async () => {
    await scaffold('typescript-stdio-tool');
    const pkgPath = path.join(tmp, 'srv/package.json');
    const pkg = await fs.readJson(pkgPath);
    await fs.writeJson(pkgPath, {
      ...pkg,
      name: '@baum97/srv',
      repository: { type: 'git', url: 'git+https://github.com/Baum97/srv.git' },
    });
    const res = await createServerJson('srv');
    expectValid(res.serverJson);
    expect(res.serverName).toBe('io.github.Baum97/srv');
    expect(res.serverJson.repository).toEqual({ url: 'https://github.com/Baum97/srv', source: 'github' });
    expect((res.serverJson.packages as { identifier: string }[])[0].identifier).toBe('@baum97/srv');
  });

  it('PyPI server: uvx runtime hint + mcp-name line in README', async () => {
    await scaffold('python-stdio-tool');
    const res = await createServerJson('srv', { namespace: 'io.github.baum97' });
    expectValid(res.serverJson);
    expect(res.serverJson.packages).toEqual([
      { registryType: 'pypi', identifier: 'srv', version: '0.1.0', runtimeHint: 'uvx', transport: { type: 'stdio' } },
    ]);
    const readme = await fs.readFile(path.join(tmp, 'srv/README.md'), 'utf8');
    expect(readme).toMatch(/\n<!-- mcp-name: io\.github\.baum97\/srv -->\n$/);

    // Regenerating with another namespace replaces the line instead of adding a second one.
    await createServerJson('srv', { namespace: 'io.github.other', force: true });
    const again = await fs.readFile(path.join(tmp, 'srv/README.md'), 'utf8');
    expect(again.match(/<!-- mcp-name:/g)).toHaveLength(1);
    expect(again).toContain('io.github.other/srv');
  });

  it.each(['typescript-streamable-http', 'python-streamable-http'])(
    '%s: requires --url and publishes it as a remote',
    async (template) => {
      await scaffold(template);
      await expect(createServerJson('srv', { namespace: 'io.github.baum97' })).rejects.toThrow(/--url/);
      const res = await createServerJson('srv', {
        namespace: 'io.github.baum97',
        url: 'https://mcp.example.com/mcp',
      });
      expectValid(res.serverJson);
      expect(res.serverJson.remotes).toEqual([{ type: 'streamable-http', url: 'https://mcp.example.com/mcp' }]);
      expect(res.serverJson.packages).toBeUndefined();
    },
  );

  it('shortens descriptions to the 100-character registry limit', async () => {
    await scaffold('typescript-stdio-tool', 'x'.repeat(150));
    const res = await createServerJson('srv', { namespace: 'io.github.baum97' });
    expectValid(res.serverJson);
    expect((res.serverJson.description as string).length).toBe(100);
    expect(res.notes.join()).toMatch(/shortened/);
  });

  it('refuses to overwrite server.json without force, and needs a namespace', async () => {
    await scaffold('typescript-stdio-tool');
    await expect(createServerJson('srv')).rejects.toThrow(/--namespace/);
    await createServerJson('srv', { namespace: 'io.github.baum97' });
    await expect(createServerJson('srv', { namespace: 'io.github.baum97' })).rejects.toThrow(/--force/);
  });
});
