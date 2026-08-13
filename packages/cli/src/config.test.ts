import { describe, expect, it } from 'vitest';
import { createInstallConfig } from './config.js';

describe('createInstallConfig', () => {
  it('forces production authentication and does not persist a provider token', () => {
    const config = createInstallConfig({
      repositoryRoot: 'C:\\src\\workerdeck',
      workerName: 'workerdeck-control-plane',
      accountId: 'account-id',
      accountName: 'Example account',
      buildTokenId: 'build-token-id',
      dashboardOrigin: 'https://deck.example.com',
      accessTeamDomain: 'example.cloudflareaccess.com',
      accessAudience: 'audience',
      githubAppId: '123456',
      githubAppSlug: 'workerdeck-example',
    });

    expect(config).not.toHaveProperty('vars.CLOUDFLARE_API_TOKEN');
    expect(config).not.toHaveProperty('vars.CLOUDFLARE_BUILD_TOKEN');
    expect(config).toHaveProperty('vars.CLOUDFLARE_BUILD_TOKEN_ID', 'build-token-id');
    expect(config).toHaveProperty('vars.AUTH_MODE', 'cloudflare-access');
    expect(config).toHaveProperty('vars.ENVIRONMENT', 'production');
    expect(config).toHaveProperty('vars.GITHUB_APP_ID', '123456');
    expect(config).toHaveProperty('vars.GITHUB_APP_SLUG', 'workerdeck-example');
    expect(config).toHaveProperty('workers_dev', false);
    expect(config).toHaveProperty('preview_urls', false);
    expect(config).toHaveProperty('triggers.crons', ['* * * * *']);
    expect(config).toHaveProperty('routes.0', {
      pattern: 'deck.example.com',
      custom_domain: true,
    });
  });

  it('rejects a dashboard URL that could leave the Access boundary ambiguous', () => {
    expect(() =>
      createInstallConfig({
        repositoryRoot: '/src/workerdeck',
        workerName: 'workerdeck-control-plane',
        accountId: 'account-id',
        accountName: 'Example account',
        buildTokenId: 'build-token-id',
        dashboardOrigin: 'http://deck.example.com/admin',
        accessTeamDomain: 'example.cloudflareaccess.com',
        accessAudience: 'audience',
        githubAppId: '123456',
        githubAppSlug: 'workerdeck-example',
      }),
    ).toThrow('Dashboard origin must be an HTTPS origin');
  });

  it('preserves an already-provisioned D1 database during an installation retry', () => {
    const config = createInstallConfig({
      repositoryRoot: '/src/workerdeck',
      workerName: 'workerdeck-control-plane',
      accountId: 'account-id',
      accountName: 'Example account',
      buildTokenId: 'build-token-id',
      dashboardOrigin: 'https://deck.example.com',
      accessTeamDomain: 'example.cloudflareaccess.com',
      accessAudience: 'audience',
      githubAppId: '123456',
      githubAppSlug: 'workerdeck-example',
      databaseId: 'eb051260-d2cc-4350-9fa3-ea0f5684c2d2',
    });

    expect(config).toHaveProperty(
      'd1_databases.0.database_id',
      'eb051260-d2cc-4350-9fa3-ea0f5684c2d2',
    );
  });
});
