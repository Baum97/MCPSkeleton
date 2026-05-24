import fs from 'fs-extra';
import path from 'node:path';
import kleur from 'kleur';
import { TEMPLATES_ROOT } from './templates.js';
import type { Answers } from './prompts.js';

const PLACEHOLDER_FILES = new Set(['package.json', 'README.md', 'tsconfig.json']);

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

  // Rename _gitignore -> .gitignore (npm strips real .gitignore from packages)
  const gitignoreSrc = path.join(targetDir, '_gitignore');
  if (await fs.pathExists(gitignoreSrc)) {
    await fs.move(gitignoreSrc, path.join(targetDir, '.gitignore'));
  }

  await applyPlaceholders(targetDir, answers);
  console.log(kleur.gray(`  Wrote to ${targetDir}`));
}

async function applyPlaceholders(dir: string, answers: Answers): Promise<void> {
  const replacements: Record<string, string> = {
    '{{projectName}}': answers.projectName,
    '{{description}}': answers.description,
    '{{author}}': answers.author,
  };

  const walk = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        await walk(full);
      } else if (PLACEHOLDER_FILES.has(entry.name)) {
        let content = await fs.readFile(full, 'utf8');
        for (const [token, value] of Object.entries(replacements)) {
          content = content.split(token).join(value);
        }
        await fs.writeFile(full, content);
      }
    }
  };

  await walk(dir);
}
