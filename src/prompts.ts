import { input, select } from '@inquirer/prompts';
import path from 'node:path';
import type { TemplateInfo } from './templates.js';

export interface Answers {
  directory: string;
  projectName: string;
  description: string;
  author: string;
  template: string;
}

interface RunOpts {
  directory?: string;
  template?: string;
  skipPrompts: boolean;
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
        }));

  const projectName = path.basename(path.resolve(directory));

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
    : await input({
        message: 'Description:',
        default: 'An MCP server.',
      });

  const author = opts.skipPrompts
    ? ''
    : await input({
        message: 'Author:',
        default: '',
      });

  return { directory, projectName, description, author, template };
}
