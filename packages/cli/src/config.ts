import path from 'node:path';

export interface InstallConfigInput {
  repositoryRoot: string;
  workerName: string;
  accountId: string;
  accountName: string;
  buildTokenId: string;
  dashboardOrigin: string;
  accessTeamDomain: string;
  accessAudience: string;
  githubAppId: string;
  githubAppSlug: string;
}

export function createInstallConfig(input: InstallConfigInput): Record<string, unknown> {
  const dashboardUrl = new URL(input.dashboardOrigin);
  if (
    dashboardUrl.protocol !== 'https:' ||
    dashboardUrl.pathname !== '/' ||
    dashboardUrl.search ||
    dashboardUrl.hash
  ) {
    throw new Error('Dashboard origin must be an HTTPS origin without a path, query, or fragment.');
  }
  const generatedDirectory = path.join(input.repositoryRoot, '.wrangler');
  const relativeFromGenerated = (target: string) =>
    path
      .relative(generatedDirectory, path.join(input.repositoryRoot, target))
      .replaceAll('\\', '/');

  return {
    $schema: '../node_modules/wrangler/config-schema.json',
    name: input.workerName,
    main: relativeFromGenerated('apps/control-plane/src/index.ts'),
    compatibility_date: '2026-08-12',
    compatibility_flags: ['nodejs_compat'],
    account_id: input.accountId,
    workers_dev: false,
    preview_urls: false,
    routes: [{ pattern: dashboardUrl.hostname, custom_domain: true }],
    observability: { enabled: true, head_sampling_rate: 1 },
    vars: {
      ENVIRONMENT: 'production',
      AUTH_MODE: 'cloudflare-access',
      DASHBOARD_ORIGIN: input.dashboardOrigin,
      CLOUDFLARE_ACCOUNT_ID: input.accountId,
      CLOUDFLARE_ACCOUNT_NAME: input.accountName,
      CLOUDFLARE_BUILD_TOKEN_ID: input.buildTokenId,
      ACCESS_TEAM_DOMAIN: input.accessTeamDomain,
      ACCESS_AUD: input.accessAudience,
      GITHUB_APP_ID: input.githubAppId,
      GITHUB_APP_SLUG: input.githubAppSlug,
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'workerdeck',
        migrations_dir: relativeFromGenerated('apps/control-plane/migrations'),
      },
    ],
    assets: {
      binding: 'ASSETS',
      directory: relativeFromGenerated('apps/dashboard/dist'),
      not_found_handling: 'single-page-application',
      run_worker_first: true,
    },
  };
}
