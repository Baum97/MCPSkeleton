import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import kleur from 'kleur';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export function detectPackageManager(): PackageManager {
  const ua = process.env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  return 'npm';
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

export async function installDeps(targetDir: string, pm: PackageManager): Promise<void> {
  console.log(kleur.gray(`  Installing dependencies with ${pm}...`));
  await run(pm, ['install'], targetDir);
}

export async function initGit(targetDir: string): Promise<void> {
  if (await fs.pathExists(path.join(targetDir, '.git'))) return;
  console.log(kleur.gray('  Initializing git repository...'));
  await run('git', ['init', '--quiet'], targetDir);
  await run('git', ['add', '.'], targetDir);
  await run(
    'git',
    ['commit', '--quiet', '-m', 'chore: initial commit from create-mcp-server'],
    targetDir,
  );
}
