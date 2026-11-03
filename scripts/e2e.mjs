#!/usr/bin/env node
// End-to-end check: generate every template, install its dependencies, build
// it, start the server and talk to it with the official MCP client.
//
//   node scripts/e2e.mjs                    # all templates
//   node scripts/e2e.mjs typescript-stdio-tool python-stdio-tool
//
// Requires `npm run build` first. Python templates need `uv` on PATH and are
// skipped (with a warning) when it is missing, unless E2E_REQUIRE_UV=1.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');
const isWin = process.platform === 'win32';

/** What each template must expose, and one tool call to prove it works. */
const EXPECT = {
  'typescript-stdio-tool': {
    add: [['tool', 'lookup']],
    tools: ['echo', 'lookup'],
    call: ['echo', { message: 'hi' }, 'You said: hi'],
  },
  'typescript-stdio-resource': {
    // `add prompt` must also wire up zod, which this template does not ship.
    add: [['prompt', 'summarize'], ['tool', 'lookup']],
    tools: ['lookup'],
    prompts: ['summarize'],
    resources: ['info://server'],
    read: 'greeting://world',
  },
  'typescript-stdio-full': {
    tools: ['add', 'get_time'],
    prompts: ['review-code'],
    resources: ['note://welcome'],
    call: ['add', { a: 2, b: 3 }, '{"sum":5}'],
    structured: { sum: 5 },
  },
  'typescript-streamable-http': {
    http: true,
    add: [['tool', 'lookup']],
    tools: ['echo', 'lookup'],
    call: ['echo', { message: 'hi' }, 'You said: hi'],
  },
  'python-stdio-tool': {
    python: true,
    add: [['tool', 'fetch-page'], ['resource', 'status']],
    tools: ['add', 'echo', 'fetch-page'],
    prompts: ['review_code'],
    resources: ['info://server', 'data://status'],
    call: ['echo', { message: 'hi' }, 'You said: hi'],
  },
  'python-streamable-http': {
    python: true,
    http: true,
    add: [['tool', 'lookup']],
    tools: ['echo', 'lookup'],
    call: ['echo', { message: 'hi' }, 'You said: hi'],
  },
};

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status})`);
}

function hasUv() {
  return spawnSync('uv', ['--version'], { stdio: 'ignore', shell: isWin }).status === 0;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function waitForHttp(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not come up at ${url}`);
}

async function exercise(client, exp) {
  const names = (list) => list.map((x) => x.name ?? x.uri).sort();
  if (exp.tools) {
    const { tools } = await client.listTools();
    for (const t of exp.tools) assert(names(tools).includes(t), `missing tool ${t}: ${names(tools)}`);
  }
  if (exp.prompts) {
    const { prompts } = await client.listPrompts();
    for (const p of exp.prompts) assert(names(prompts).includes(p), `missing prompt ${p}`);
  }
  if (exp.resources) {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    for (const r of exp.resources) assert(uris.includes(r), `missing resource ${r}: ${uris}`);
  }
  if (exp.read) {
    const res = await client.readResource({ uri: exp.read });
    assert(res.contents[0]?.text?.includes('world'), `bad read of ${exp.read}`);
  }
  if (exp.call) {
    const [name, args, text] = exp.call;
    const res = await client.callTool({ name, arguments: args });
    assert(!res.isError, `${name} returned an error: ${JSON.stringify(res)}`);
    assert(res.content[0]?.text === text, `${name} returned ${JSON.stringify(res.content)}`);
    if (exp.structured) {
      assert(
        JSON.stringify(res.structuredContent) === JSON.stringify(exp.structured),
        `structuredContent was ${JSON.stringify(res.structuredContent)}`,
      );
    }
  }
}

async function connectHttp(client, command, args, exp) {
  const port = String(40000 + Math.floor(Math.random() * 10000));
  const child = spawn(command, args, {
    env: { ...process.env, PORT: port },
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: isWin,
  });
  try {
    await waitForHttp(`http://127.0.0.1:${port}/healthz`, 60_000);
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    await exercise(client, exp);
    await client.close();
  } finally {
    child.kill();
  }
}

async function runTemplate(template, workDir) {
  const exp = EXPECT[template];
  const dir = path.join(workDir, template);
  console.log(`\n=== ${template}`);
  sh(process.execPath, [CLI, dir, '-t', template, '-y', '--no-install', '--no-git'], workDir);
  for (const [kind, name] of exp.add ?? []) {
    sh(process.execPath, [CLI, 'add', kind, name, '--dir', dir], workDir);
  }

  const client = new Client({ name: 'e2e', version: '0.0.0' });

  if (exp.python) {
    sh('uv', ['sync', '--quiet'], dir);
    // The console script is named after the project directory.
    const uvArgs = ['--directory', dir, 'run', template];
    if (exp.http) return connectHttp(client, 'uv', uvArgs, exp);
    await client.connect(new StdioClientTransport({ command: 'uv', args: uvArgs, stderr: 'inherit' }));
    await exercise(client, exp);
    await client.close();
    return;
  }

  sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], dir);
  sh('npm', ['run', 'build'], dir);
  const entry = path.join(dir, 'dist/index.js');

  if (exp.http) return connectHttp(client, process.execPath, [entry], exp);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], stderr: 'inherit' }));
  await exercise(client, exp);
  await client.close();
}

const requested = process.argv.slice(2);
const templates = requested.length ? requested : Object.keys(EXPECT);
const uv = hasUv();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-skel-e2e-'));
const failures = [];

for (const t of templates) {
  if (!EXPECT[t]) {
    failures.push(`${t}: no e2e expectations defined in scripts/e2e.mjs`);
    continue;
  }
  if (EXPECT[t].python && !uv) {
    if (process.env.E2E_REQUIRE_UV === '1') failures.push(`${t}: uv not found`);
    else console.warn(`\n=== ${t}: skipped (uv not found)`);
    continue;
  }
  try {
    await runTemplate(t, workDir);
    console.log(`✔ ${t}`);
  } catch (err) {
    console.error(`✘ ${t}: ${err.message}`);
    failures.push(`${t}: ${err.message}`);
  }
}

fs.rmSync(workDir, { recursive: true, force: true });
if (failures.length) {
  console.error(`\n${failures.length} template(s) failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nAll templates passed end-to-end.');
