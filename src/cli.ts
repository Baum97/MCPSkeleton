#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import kleur from 'kleur';
import { runPrompts } from './prompts.js';
import { generate } from './generator.js';
import { listTemplates } from './templates.js';
import { detectPackageManager, installDeps, initGit } from './postInstall.js';

const program = new Command();

program
  .name('create-mcp-server')
  .description('Scaffold a Model Context Protocol server in seconds.')
  .version('0.0.1')
  .argument('[directory]', 'directory to create the project in')
  .option('-t, --template <name>', 'template to use (skip the prompt)')
  .option('-y, --yes', 'accept all defaults, do not prompt')
  .option('--install', 'install dependencies after generating')
  .option('--no-install', 'do not install dependencies')
  .option('--git', 'initialize a git repo after generating')
  .option('--no-git', 'do not initialize a git repo')
  .action(
    async (
      directory: string | undefined,
      opts: {
        template?: string;
        yes?: boolean;
        install?: boolean;
        git?: boolean;
      },
    ) => {
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
          install: opts.install,
          git: opts.git,
          templates,
        });

        await generate(answers);

        const targetDir = path.resolve(process.cwd(), answers.directory);
        const pm = detectPackageManager();

        if (answers.install) {
          await installDeps(targetDir, pm);
        }
        if (answers.git) {
          try {
            await initGit(targetDir);
          } catch (err) {
            console.warn(
              kleur.yellow(`  Warning: git init failed (${(err as Error).message}). Skipping.`),
            );
          }
        }

        console.log(kleur.green('\n  Done! Next steps:\n'));
        console.log(`    cd ${answers.directory}`);
        if (!answers.install) console.log(`    ${pm} install`);
        console.log(`    ${pm} run build`);
        console.log(`    ${pm} start\n`);
      } catch (err) {
        if (err instanceof Error && err.name === 'ExitPromptError') {
          console.log(kleur.gray('\n  Cancelled.\n'));
          process.exit(0);
        }
        console.error(kleur.red('\n  Error:'), err);
        process.exit(1);
      }
    },
  );

program.parseAsync();
