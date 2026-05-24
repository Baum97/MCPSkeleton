#!/usr/bin/env node
import { Command } from 'commander';
import kleur from 'kleur';
import { runPrompts } from './prompts.js';
import { generate } from './generator.js';
import { listTemplates } from './templates.js';

const program = new Command();

program
  .name('create-mcp-server')
  .description('Scaffold a Model Context Protocol server in seconds.')
  .version('0.0.1')
  .argument('[directory]', 'directory to create the project in')
  .option('-t, --template <name>', 'template to use (skip the prompt)')
  .option('-y, --yes', 'accept all defaults, do not prompt')
  .action(async (directory: string | undefined, opts: { template?: string; yes?: boolean }) => {
    try {
      console.log(kleur.bold().cyan('\n  create-mcp-server\n'));

      const templates = await listTemplates();
      if (templates.length === 0) {
        console.error(kleur.red('No templates found. Did you run `npm run build`?'));
        process.exit(1);
      }

      const answers = await runPrompts({
        directory,
        template: opts.template,
        skipPrompts: opts.yes ?? false,
        templates,
      });

      await generate(answers);

      console.log(kleur.green('\n  Done! Next steps:\n'));
      console.log(`    cd ${answers.directory}`);
      console.log('    npm install');
      console.log('    npm run build');
      console.log('    npm start\n');
    } catch (err) {
      if (err instanceof Error && err.name === 'ExitPromptError') {
        console.log(kleur.gray('\n  Cancelled.\n'));
        process.exit(0);
      }
      console.error(kleur.red('\n  Error:'), err);
      process.exit(1);
    }
  });

program.parseAsync();
