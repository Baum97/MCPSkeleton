import fs from 'fs-extra';
import path from 'node:path';
import kleur from 'kleur';
import { TEMPLATES_ROOT } from './templates.js';
import type { Answers } from './prompts.js';

// Extensions whose contents are scanned for {{token}} placeholders.
const PLACEHOLDER_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.toml',
  '.py',
]);

// Specific filenames (no extension) that should also be scanned.
const PLACEHOLDER_FILENAMES = new Set(['Dockerfile', '.gitignore']);

export async function generate(answers: Answers): Promise<void> {
  const targetDir = path.resolve(process.cwd(), answers.directory);
  const templateDir = path.join(TEMPLATES_ROOT, answers.template);

  if (!(await fs.pathExists(templateDir))) {
    throw new Error(`Template "${answers.template}" not found.`);
  }

  if (await fs.pathExists(targetDir)) {
    const contents = await fs.readdir(targetDir);
    if (contents.length > 0) {
      throw new Error(`Directory "${answers.directory}" is not empty.`);
    }
  }

  await fs.ensureDir(targetDir);
  console.log(kleur.gray(`  Copying template "${answers.template}"...`));

  await fs.copy(templateDir, targetDir, {
    filter: (src) => path.basename(src) !== 'template.json',
  });

  // npm strips real .gitignore from packages — templates ship `_gitignore`
  const gitignoreSrc = path.join(targetDir, '_gitignore');
  if (await fs.pathExists(gitignoreSrc)) {
    await fs.move(gitignoreSrc, path.join(targetDir, '.gitignore'));
  }

  await renamePlaceholderPaths(targetDir, answers);
  await applyPlaceholders(targetDir, answers);
  console.log(kleur.gray(`  Wrote to ${targetDir}`));
}

/**
 * Python-importable form of the project name: `my-server` → `my_server`.
 * Used for package directories (`__packageName__`) and `{{packageName}}`.
 */
export function toPackageName(projectName: string): string {
  const base = projectName.replace(/^@[^/]+\//, '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return /^[0-9]/.test(base) ? `_${base}` : base;
}

/** Rename files/directories whose name contains `__packageName__`. */
async function renamePlaceholderPaths(dir: string, answers: Answers): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    let full = path.join(dir, entry.name);
    if (entry.name.includes('__packageName__')) {
      const renamed = path.join(
        dir,
        entry.name.split('__packageName__').join(toPackageName(answers.projectName)),
      );
      await fs.move(full, renamed);
      full = renamed;
    }
    if (entry.isDirectory()) await renamePlaceholderPaths(full, answers);
  }
}

function shouldSubstitute(filename: string): boolean {
  if (PLACEHOLDER_FILENAMES.has(filename)) return true;
  return PLACEHOLDER_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

async function applyPlaceholders(dir: string, answers: Answers): Promise<void> {
  const replacements: Record<string, string> = {
    '{{projectName}}': answers.projectName,
    '{{packageName}}': toPackageName(answers.projectName),
    '{{description}}': answers.description,
    '{{author}}': answers.author,
    '{{year}}': String(new Date().getFullYear()),
  };

  const walk = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        await walk(full);
      } else if (shouldSubstitute(entry.name)) {
        let content = await fs.readFile(full, 'utf8');
        let changed = false;
        for (const [token, value] of Object.entries(replacements)) {
          if (content.includes(token)) {
            content = content.split(token).join(value);
            changed = true;
          }
        }
        if (changed) await fs.writeFile(full, content);
      }
    }
  };

  await walk(dir);
}
