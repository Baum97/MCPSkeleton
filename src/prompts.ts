import { input, select, confirm } from '@inquirer/prompts';
import path from 'node:path';
import type { TemplateInfo } from './templates.js';
import { validateProjectName } from './validate.js';

export interface Answers {
  directory: string;
  projectName: string;
  description: string;
  author: string;
  template: string;
  install: boolean;
  git: boolean;
}

interface RunOpts {
  directory?: string;
  template?: string;
  skipPrompts: boolean;
  install?: boolean;
  git?: boolean;
  templates: TemplateInfo[];
}

export async function runPrompts(opts: RunOpts): Promise<Answers> {
  const directory =
    opts.directory ??
    (opts.skipPrompts
      ? 'my-mcp-server'
      : await input({
          message: 'Project directory:',
          default: 'my-mcp-server',
          validate: (v) => {
            const name = path.basename(path.resolve(v));
            return validateProjectName(name);
          },
        }));

  const projectName = path.basename(path.resolve(directory));
  const nameCheck = validateProjectName(projectName);
  if (nameCheck !== true) {
    throw new Error(`Invalid project name "${projectName}": ${nameCheck}`);
  }

  const template =
    opts.template ??
    (opts.skipPrompts
      ? opts.templates[0].name
      : await select({
          message: 'Choose a template:',
          choices: opts.templates.map((t) => ({
            name: `${t.name} — ${t.description}`,
            value: t.name,
          })),
        }));

  const description = opts.skipPrompts
    ? 'An MCP server.'
    : await input({ message: 'Description:', default: 'An MCP server.' });

  const author = opts.skipPrompts
    ? ''
    : await input({ message: 'Author:', default: '' });

  const install =
    opts.install ??
    (opts.skipPrompts
      ? false
      : await confirm({ message: 'Install dependencies now?', default: true }));

  const git =
    opts.git ??
    (opts.skipPrompts
      ? false
      : await confirm({ message: 'Initialize a git repository?', default: true }));

  return { directory, projectName, description, author, template, install, git };
}
