#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import kleur from 'kleur';
import { NPX, PACKAGE_VERSION } from './meta.js';
import { runPrompts } from './prompts.js';
import { ADD_KINDS, addPrimitive, type AddKind } from './add.js';
import { createServerJson } from './registry.js';
import { generate } from './generator.js';
import { listTemplates } from './templates.js';
import { detectPackageManager, installDeps, installPythonDeps, initGit } from './postInstall.js';
import {
  CLIENTS,
  buildClientConfig,
  detectServer,
  renderSnippet,
  writeClientConfig,
  type ClientId,
} from './clientConfig.js';

const program = new Command();

program
  .name('create-mcp-server')
  .description('Scaffold a Model Context Protocol server in seconds.')
  .version(PACKAGE_VERSION)
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

        const template = templates.find((t) => t.name === answers.template);
        const isPython = template?.language === 'python';
        const isHttp = template?.transport === 'http';
        const targetDir = path.resolve(process.cwd(), answers.directory);
        const pm = detectPackageManager();

        let installed = false;
        if (answers.install) {
          if (isPython) {
            installed = await installPythonDeps(targetDir);
          } else {
            await installDeps(targetDir, pm);
            installed = true;
          }
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
        if (isPython) {
          if (!installed) console.log('    uv sync');
          console.log(`    uv run ${answers.projectName}${isHttp ? '      # http://127.0.0.1:3000/mcp' : ''}`);
        } else {
          if (!installed) console.log(`    ${pm} install`);
          console.log(`    ${pm} run build`);
          console.log(`    ${pm} start${isHttp ? '        # http://127.0.0.1:3000/mcp' : ''}`);
        }
        console.log(kleur.gray('\n  Connect it to a client (claude-desktop, claude-code, cursor, vscode):\n'));
        console.log(`    ${NPX} config ${answers.directory} --client claude-desktop\n`);
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

program
  .command('config')
  .description('print (or write) the MCP client config entry for a generated server')
  .argument('[directory]', 'server project directory', '.')
  .option(
    '-c, --client <client>',
    `client to configure: ${CLIENTS.join(', ')}`,
    'claude-desktop',
  )
  .option('--url <url>', 'configure a remote (Streamable HTTP) server at this URL')
  .option('--name <name>', 'server name used as the config key')
  .option('-w, --write', 'merge the entry into the client config file')
  .option('-f, --force', 'with --write, replace an existing entry of the same name')
  .action(
    async (
      directory: string,
      opts: { client: string; url?: string; name?: string; write?: boolean; force?: boolean },
    ) => {
      try {
        if (!(CLIENTS as readonly string[]).includes(opts.client)) {
          throw new Error(`Unknown client "${opts.client}". Choose one of: ${CLIENTS.join(', ')}.`);
        }
        const server = await detectServer(directory, { url: opts.url, name: opts.name });
        const config = buildClientConfig(opts.client as ClientId, server);

        if (opts.write) {
          const result = await writeClientConfig(config, server.name, { force: opts.force });
          console.log(kleur.green(`  ${result === 'created' ? 'Created' : 'Updated'} ${config.file}`));
          if (opts.client === 'claude-desktop') {
            console.log(kleur.gray('  Restart Claude Desktop to load the server.'));
          }
        } else {
          console.log(kleur.gray(`\n  Add to ${config.file}:\n`));
          console.log(renderSnippet(config, server.name));
          if (config.command) {
            console.log(kleur.gray('\n  …or run:\n'));
            console.log(`  ${config.command}`);
          }
          console.log(kleur.gray('\n  Tip: pass --write to merge it automatically.'));
        }
        if (config.note) console.log(kleur.gray(`  ${config.note}`));
        console.log();
      } catch (err) {
        console.error(kleur.red('\n  Error:'), (err as Error).message, '\n');
        process.exit(1);
      }
    },
  );

program
  .command('add')
  .description('add a tool, resource or prompt to an existing generated server')
  .argument('<kind>', `what to add: ${ADD_KINDS.join(', ')}`)
  .argument('<name>', 'name of the new tool/resource/prompt')
  .option('-d, --dir <directory>', 'server project directory', '.')
  .option('--description <text>', 'description shown to the model')
  .option('--uri <uri>', 'resource URI (default: data://<name>)')
  .action(
    async (kind: string, name: string, opts: { dir: string; description?: string; uri?: string }) => {
      try {
        const result = await addPrimitive(opts.dir, kind as AddKind, name, {
          description: opts.description,
          uri: opts.uri,
        });
        console.log(kleur.green(`\n  Added ${kind} "${name}" to ${result.file}`));
        for (const f of result.alsoUpdated) console.log(kleur.gray(`  Updated ${f}`));
        for (const n of result.notes) console.log(kleur.gray(`  ${n}`));
        console.log();
      } catch (err) {
        console.error(kleur.red('\n  Error:'), (err as Error).message, '\n');
        process.exit(1);
      }
    },
  );

program
  .command('registry')
  .description('write server.json for the official MCP Registry (and the ownership proof it checks)')
  .argument('[directory]', 'server project directory', '.')
  .option('--namespace <ns>', 'reverse-DNS namespace, e.g. io.github.<user> (default: from GitHub remote)')
  .option('--url <url>', 'public URL of a deployed Streamable HTTP server')
  .option('-f, --force', 'overwrite an existing server.json')
  .action(async (directory: string, opts: { namespace?: string; url?: string; force?: boolean }) => {
    try {
      const result = await createServerJson(directory, opts);
      console.log(kleur.green(`\n  Wrote ${result.file} (${result.serverName})`));
      for (const f of result.updated) console.log(kleur.gray(`  Updated ${f}`));
      console.log();
      for (const n of result.notes) console.log(`  • ${n}`);
      console.log();
    } catch (err) {
      console.error(kleur.red('\n  Error:'), (err as Error).message, '\n');
      process.exit(1);
    }
  });

program.parseAsync();
