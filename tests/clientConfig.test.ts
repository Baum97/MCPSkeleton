import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  buildClientConfig,
  claudeDesktopConfigPath,
  detectServer,
  renderSnippet,
  writeClientConfig,
  DEFAULT_HTTP_URL,
  type ServerSpec,
} from '../src/clientConfig.js';
import { generate } from '../src/generator.js';
import type { Answers } from '../src/prompts.js';

let tmp: string;
let prevCwd: string;

beforeEach(async () => {
  prevCwd = process.cwd();
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-skel-cfg-'));
  process.chdir(tmp);
  // Resolve symlinks (macOS: /var → /private/var) so paths compare equal.
  tmp = process.cwd();
});

afterEach(async () => {
  process.chdir(prevCwd);
  await fs.remove(tmp);
});

const answers = (template: string, directory = 'srv'): Answers => ({
  directory,
  projectName: directory,
  description: 'x',
  author: '',
  template,
  install: false,
  git: false,
});

const stdio: ServerSpec = {
  name: 'srv',
  launch: { kind: 'stdio', command: 'node', args: ['/abs/srv/dist/index.js'] },
};
const http: ServerSpec = { name: 'srv', launch: { kind: 'http', url: 'https://x.dev/mcp' } };

describe('detectServer', () => {
  it('detects a stdio Node server from its bin entry', async () => {
    await generate(answers('typescript-stdio-tool'));
    const spec = await detectServer('srv');
    expect(spec.name).toBe('srv');
    expect(spec.launch).toEqual({
      kind: 'stdio',
      command: 'node',
      args: [path.join(tmp, 'srv', 'dist/index.js')],
    });
  });

  it('detects a Streamable HTTP server', async () => {
    await generate(answers('typescript-streamable-http'));
    expect((await detectServer('srv')).launch).toEqual({ kind: 'http', url: DEFAULT_HTTP_URL });
  });

  it('detects a Python server and launches it with uv', async () => {
    await generate(answers('python-stdio-tool'));
    expect((await detectServer('srv')).launch).toEqual({
      kind: 'stdio',
      command: 'uv',
      args: ['--directory', path.join(tmp, 'srv'), 'run', 'srv'],
    });
  });

  it('detects a Python Streamable HTTP server', async () => {
    await generate(answers('python-streamable-http'));
    expect((await detectServer('srv')).launch).toEqual({ kind: 'http', url: DEFAULT_HTTP_URL });
  });

  it('falls back to a flat server.py without console scripts', async () => {
    await fs.outputFile(path.join(tmp, 'flat/pyproject.toml'), '[project]\nname = "flat"\n');
    await fs.outputFile(path.join(tmp, 'flat/server.py'), 'mcp.run(transport="stdio")\n');
    expect((await detectServer('flat')).launch).toMatchObject({ args: ['--directory', path.join(tmp, 'flat'), 'run', 'server.py'] });
  });

  it('strips npm scopes from the server name and honours --url/--name', async () => {
    await fs.outputJson(path.join(tmp, 'p/package.json'), { name: '@me/thing' });
    expect((await detectServer('p')).name).toBe('thing');
    const remote = await detectServer('p', { url: 'https://a.b/mcp', name: 'custom' });
    expect(remote).toEqual({ name: 'custom', launch: { kind: 'http', url: 'https://a.b/mcp' } });
  });

  it('fails clearly for a directory that is not a server project', async () => {
    await expect(detectServer('nope')).rejects.toThrow(/--url/);
  });
});

describe('buildClientConfig', () => {
  const env = { homedir: '/home/u', cwd: '/work', platform: 'linux' as const, env: {} };

  it('uses per-OS Claude Desktop paths', () => {
    expect(claudeDesktopConfigPath({ homedir: '/Users/u', platform: 'darwin' })).toBe(
      '/Users/u/Library/Application Support/Claude/claude_desktop_config.json',
    );
    expect(claudeDesktopConfigPath({ homedir: '/home/u', platform: 'linux' })).toBe(
      '/home/u/.config/Claude/claude_desktop_config.json',
    );
    expect(
      claudeDesktopConfigPath({ homedir: 'C:\\u', platform: 'win32', env: { APPDATA: 'C:\\AppData' } }),
    ).toBe('C:\\AppData\\Claude\\claude_desktop_config.json');
  });

  it('claude-desktop: stdio entry, or mcp-remote bridge for HTTP', () => {
    expect(buildClientConfig('claude-desktop', stdio, env).entry).toEqual({
      command: 'node',
      args: ['/abs/srv/dist/index.js'],
    });
    expect(buildClientConfig('claude-desktop', http, env).entry).toEqual({
      command: 'npx',
      args: ['-y', 'mcp-remote', 'https://x.dev/mcp'],
    });
  });

  it('vscode: uses the `servers` key and typed entries in .vscode/mcp.json', () => {
    const cfg = buildClientConfig('vscode', http, env);
    expect(cfg.file).toBe(path.join('/work', '.vscode', 'mcp.json'));
    expect(JSON.parse(renderSnippet(cfg, 'srv'))).toEqual({
      servers: { srv: { type: 'http', url: 'https://x.dev/mcp' } },
    });
  });

  it('cursor: global ~/.cursor/mcp.json', () => {
    const cfg = buildClientConfig('cursor', http, env);
    expect(cfg.file).toBe(path.join('/home/u', '.cursor', 'mcp.json'));
    expect(cfg.entry).toEqual({ url: 'https://x.dev/mcp' });
  });

  it('claude-code: .mcp.json entry plus a `claude mcp add` command', () => {
    expect(buildClientConfig('claude-code', stdio, env).command).toBe(
      'claude mcp add srv -- node /abs/srv/dist/index.js',
    );
    expect(buildClientConfig('claude-code', http, env).command).toBe(
      'claude mcp add --transport http srv https://x.dev/mcp',
    );
  });
});

describe('writeClientConfig', () => {
  it('creates, merges, and refuses to clobber without force', async () => {
    const file = path.join(tmp, 'cfg', 'claude_desktop_config.json');
    await fs.outputJson(file, { mcpServers: { other: { command: 'x' } }, theme: 'dark' });
    const cfg = { ...buildClientConfig('claude-desktop', stdio, { homedir: tmp }), file };

    expect(await writeClientConfig(cfg, 'srv')).toBe('updated');
    const merged = await fs.readJson(file);
    expect(merged.theme).toBe('dark');
    expect(Object.keys(merged.mcpServers)).toEqual(['other', 'srv']);

    await expect(writeClientConfig(cfg, 'srv')).rejects.toThrow(/--force/);
    await expect(writeClientConfig(cfg, 'srv', { force: true })).resolves.toBe('updated');

    const fresh = { ...cfg, file: path.join(tmp, 'new', 'mcp.json') };
    expect(await writeClientConfig(fresh, 'srv')).toBe('created');
  });

  it('does not overwrite a config file it cannot parse', async () => {
    const file = path.join(tmp, 'mcp.json');
    await fs.writeFile(file, '{ // comment\n}');
    const cfg = { ...buildClientConfig('vscode', stdio, { cwd: tmp }), file };
    await expect(writeClientConfig(cfg, 'srv')).rejects.toThrow(/not plain JSON/);
    expect(await fs.readFile(file, 'utf8')).toBe('{ // comment\n}');
  });
});
