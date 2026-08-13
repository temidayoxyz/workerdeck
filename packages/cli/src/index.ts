#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  .requiredOption('--github-app-id <id>', 'WorkerDeck GitHub App ID')
  .requiredOption('--github-app-slug <slug>', 'WorkerDeck GitHub App URL slug')
  .requiredOption(
    '--github-app-private-key-file <path>',
    'Path to the GitHub App private-key PEM downloaded from GitHub',
  )
  .option('--worker-name <name>', 'Worker script name', 'workerdeck-control-plane')
  .option('--dry-run', 'Write and print the generated configuration without deploying')
  .action(
    async (options: {
      accountId: string;
      accountName: string;
      accessTeamDomain: string;
      accessAudience: string;
      dashboardOrigin: string;
      githubAppId: string;
      githubAppSlug: string;
      githubAppPrivateKeyFile: string;
      workerName: string;
      dryRun?: boolean;
    }) => {
      const root = process.cwd();
      const generatedDirectory = path.join(root, '.wrangler');
      const configPath = path.join(generatedDirectory, 'workerdeck.generated.json');
      prompts.intro(pc.bgBlue(pc.white(' Install WorkerDeck ')));
      prompts.log.info(
        'WorkerDeck will create one Worker and one D1 database in the selected account.',
      );
      prompts.log.warn(
        'It will never import or delete pre-existing Cloudflare resources automatically.',
      );

      if (options.dryRun) {
        const config = createInstallConfig({
          repositoryRoot: root,
          ...options,
          buildTokenId: 'derived-during-production-install',
        });
        await writeGeneratedConfig(generatedDirectory, configPath, config);
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

      const cloudflareApiToken = await requestSecret(
        'Paste the WorkerDeck control-plane token (input is hidden)',
      );
      const cloudflareBuildToken = await requestSecret(
        'Paste the WorkerDeck application-build token (input is hidden)',
      );
      const githubPrivateKey = await readGithubPrivateKey(options.githubAppPrivateKeyFile);
      const buildTokenId = await verifyCloudflareToken(cloudflareBuildToken);
      await verifyCloudflareToken(cloudflareApiToken);
      const config = createInstallConfig({ repositoryRoot: root, ...options, buildTokenId });
      await writeGeneratedConfig(generatedDirectory, configPath, config);
      const cloudflareEnvironment = { CLOUDFLARE_API_TOKEN: cloudflareApiToken };

      const spinner = prompts.spinner();
      try {
        spinner.start('Building the WorkerDeck dashboard');
        await run(npmCommand, ['run', 'build', '-w', '@workerdeck/dashboard'], root);
        spinner.stop('Dashboard built');

        prompts.log.step('Deploying the control plane and automatically provisioning D1');
        await run(npxCommand, ['wrangler', 'deploy', '--config', configPath], root, {
          env: cloudflareEnvironment,
        });

        prompts.log.step('Applying WorkerDeck database migrations');
        await run(
          npxCommand,
          ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath],
          root,
          { env: cloudflareEnvironment },
        );

        prompts.log.step('Storing encrypted Worker secrets');
        await run(
          npxCommand,
          ['wrangler', 'secret', 'put', 'CLOUDFLARE_API_TOKEN', '--config', configPath],
          root,
          { env: cloudflareEnvironment, input: cloudflareApiToken },
        );

        await run(
          npxCommand,
          ['wrangler', 'secret', 'put', 'CLOUDFLARE_BUILD_TOKEN', '--config', configPath],
          root,
          { env: cloudflareEnvironment, input: cloudflareBuildToken },
        );

        await run(
          npxCommand,
          ['wrangler', 'secret', 'put', 'GITHUB_APP_PRIVATE_KEY', '--config', configPath],
          root,
          { env: cloudflareEnvironment, input: githubPrivateKey },
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

async function requestSecret(message: string): Promise<string> {
  const value = await prompts.password({ message });
  if (prompts.isCancel(value) || !value.trim()) {
    prompts.cancel('Installation cancelled. No credential was stored.');
    process.exit(1);
  }
  return value.trim();
}

async function verifyCloudflareToken(token: string): Promise<string> {
  const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json()) as {
    success?: boolean;
    result?: { id?: string; status?: string };
    errors?: Array<{ message?: string }>;
  };
  if (
    !response.ok ||
    !payload.success ||
    payload.result?.status !== 'active' ||
    !payload.result.id
  ) {
    throw new Error(payload.errors?.[0]?.message ?? 'Cloudflare API token verification failed.');
  }
  return payload.result.id;
}

async function readGithubPrivateKey(filePath: string): Promise<string> {
  const resolvedPath = path.resolve(filePath);
  const value = (await readFile(resolvedPath, 'utf8')).trim();
  if (
    !/^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----$/.test(value)
  ) {
    throw new Error(`${resolvedPath} is not a valid private-key PEM file.`);
  }
  return value;
}

async function writeGeneratedConfig(
  directory: string,
  configPath: string,
  config: Record<string, unknown>,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}
