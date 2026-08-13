#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import * as prompts from '@clack/prompts';
import { Command } from 'commander';
import pc from 'picocolors';
import { createInstallConfig } from './config.js';
import { run } from './process.js';

const program = new Command()
  .name('workerdeck')
  .description('Install and operate WorkerDeck in your Cloudflare account.')
  .version('0.0.0');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

program
  .command('doctor')
  .description('Verify the local tools needed to install WorkerDeck.')
  .action(async () => {
    prompts.intro(pc.bgBlue(pc.white(' WorkerDeck doctor ')));
    try {
      await run(npxCommand, ['wrangler', '--version'], process.cwd());
      prompts.outro(
        'Wrangler is available. Run `workerdeck install` when your Access application is ready.',
      );
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : 'Wrangler is unavailable.');
      process.exitCode = 1;
    }
  });

program
  .command('install')
  .description('Deploy a production-authenticated WorkerDeck control plane.')
  .requiredOption('--account-id <id>', 'Cloudflare account ID')
  .requiredOption('--account-name <name>', 'Display name for the Cloudflare account')
  .requiredOption('--access-team-domain <domain>', 'Cloudflare Access team domain')
  .requiredOption('--access-audience <aud>', 'Cloudflare Access application audience tag')
  .requiredOption(
    '--dashboard-origin <origin>',
    'Public WorkerDeck origin, for example https://deck.example.com',
  )
  .requiredOption(
    '--build-token-id <id>',
    'Cloudflare API token ID for the dedicated application build token',
  )
  .requiredOption('--github-app-id <id>', 'WorkerDeck GitHub App ID')
  .requiredOption('--github-app-slug <slug>', 'WorkerDeck GitHub App URL slug')
  .option('--worker-name <name>', 'Worker script name', 'workerdeck-control-plane')
  .option('--dry-run', 'Write and print the generated configuration without deploying')
  .action(
    async (options: {
      accountId: string;
      accountName: string;
      accessTeamDomain: string;
      accessAudience: string;
      dashboardOrigin: string;
      buildTokenId: string;
      githubAppId: string;
      githubAppSlug: string;
      workerName: string;
      dryRun?: boolean;
    }) => {
      const root = process.cwd();
      const generatedDirectory = path.join(root, '.wrangler');
      const configPath = path.join(generatedDirectory, 'workerdeck.generated.json');
      const config = createInstallConfig({ repositoryRoot: root, ...options });

      prompts.intro(pc.bgBlue(pc.white(' Install WorkerDeck ')));
      prompts.log.info(
        'WorkerDeck will create one Worker and one D1 database in the selected account.',
      );
      prompts.log.warn(
        'It will never import or delete pre-existing Cloudflare resources automatically.',
      );

      await mkdir(generatedDirectory, { recursive: true });
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });

      if (options.dryRun) {
        prompts.log.info(`Generated ${configPath}`);
        prompts.outro('Dry run complete. No Cloudflare resources were changed.');
        return;
      }

      const confirmed = await prompts.confirm({
        message: `Deploy ${options.workerName} to ${options.accountName}?`,
        initialValue: false,
      });
      if (prompts.isCancel(confirmed) || !confirmed) {
        prompts.cancel('Installation cancelled. No deployment was started.');
        return;
      }

      const spinner = prompts.spinner();
      try {
        spinner.start('Building the WorkerDeck dashboard');
        await run(npmCommand, ['run', 'build', '-w', '@workerdeck/dashboard'], root);
        spinner.stop('Dashboard built');

        prompts.log.step('Deploying the control plane and automatically provisioning D1');
        await run(npxCommand, ['wrangler', 'deploy', '--config', configPath], root);

        prompts.log.step('Applying WorkerDeck database migrations');
        await run(
          npxCommand,
          ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath],
          root,
        );

        prompts.log.warn(
          'The next prompt stores your scoped Cloudflare API token as an encrypted Worker secret.',
        );
        await run(
          npxCommand,
          ['wrangler', 'secret', 'put', 'CLOUDFLARE_API_TOKEN', '--config', configPath],
          root,
        );

        prompts.log.warn(
          'The next prompt stores the dedicated application build token. Use Workers Scripts Edit only; repository builds receive this token, never the control-plane token.',
        );
        await run(
          npxCommand,
          ['wrangler', 'secret', 'put', 'CLOUDFLARE_BUILD_TOKEN', '--config', configPath],
          root,
        );

        prompts.log.warn(
          'The next prompt stores the WorkerDeck GitHub App private key. Paste the complete PEM value; Cloudflare encrypts it and WorkerDeck never stores it in D1.',
        );
        await run(
          npxCommand,
          ['wrangler', 'secret', 'put', 'GITHUB_APP_PRIVATE_KEY', '--config', configPath],
          root,
        );

        prompts.outro(
          `WorkerDeck is installed. Open ${options.dashboardOrigin} after your Access policy is active.`,
        );
      } catch (error) {
        spinner.stop('Installation stopped');
        prompts.log.error(
          error instanceof Error ? error.message : 'WorkerDeck installation failed.',
        );
        prompts.log.info(
          `The generated configuration remains at ${configPath} so the operation can be inspected and retried.`,
        );
        process.exitCode = 1;
      }
    },
  );

await program.parseAsync();
