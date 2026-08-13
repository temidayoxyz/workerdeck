import { describe, expect, it, vi } from 'vitest';
import { CloudflareClient } from './cloudflare-client';

const response = (result: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

describe('CloudflareClient', () => {
  it('unwraps the Workers deployments collection', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        deployments: [
          {
            id: 'deployment-id',
            created_on: '2026-08-12T20:00:00.000Z',
            source: 'api',
            versions: [{ percentage: 100, version_id: 'version-id' }],
          },
        ],
      }),
    );
    const client = new CloudflareClient({ token: 'token', accountId: 'account', fetcher });

    await expect(client.listDeployments('worker/name')).resolves.toEqual([
      {
        id: 'deployment-id',
        createdOn: '2026-08-12T20:00:00.000Z',
        source: 'api',
        versions: [{ percentage: 100, versionId: 'version-id' }],
      },
    ]);
    expect(fetcher.mock.calls[0]?.[0]).toContain('/workers/scripts/worker%2Fname/deployments');
  });

  it('triggers a pinned Workers Build without leaking the token into the body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        build_uuid: '182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e',
        status: 'queued',
        created_on: '2026-08-12T20:00:00.000Z',
      }),
    );
    const client = new CloudflareClient({
      token: 'secret-token',
      accountId: 'account',
      fetcher,
    });

    const build = await client.triggerBuild('trigger', {
      branch: 'main',
      commitSha: 'abcdef1234567',
    });

    expect(build).toMatchObject({ id: '182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e', status: 'queued' });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain('/accounts/account/builds/triggers/trigger/builds');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-token');
    expect(init?.body).toBe(JSON.stringify({ branch: 'main', commit_hash: 'abcdef1234567' }));
    expect(init?.body).toBeTypeOf('string');
    expect(init?.body as string).not.toContain('secret-token');
  });

  it('lists push builds with source, author, trigger, and commit metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response([
        {
          build_uuid: 'build-id',
          status: 'stopped',
          build_outcome: 'success',
          created_on: '2026-08-13T09:00:00.000Z',
          running_on: '2026-08-13T09:00:02.000Z',
          stopped_on: '2026-08-13T09:00:20.000Z',
          build_trigger_metadata: {
            author: 'developer@example.com',
            branch: 'main',
            build_trigger_source: 'push',
            commit_hash: 'abcdef1234567',
            commit_message: 'Ship from GitHub',
          },
          trigger: { trigger_uuid: 'production-trigger' },
        },
      ]),
    );
    const client = new CloudflareClient({ token: 'token', accountId: 'account', fetcher });

    await expect(client.listBuilds('worker/tag', 500)).resolves.toEqual([
      {
        id: 'build-id',
        status: 'stopped',
        outcome: 'success',
        source: 'push',
        author: 'developer@example.com',
        triggerId: 'production-trigger',
        branch: 'main',
        commitSha: 'abcdef1234567',
        commitMessage: 'Ship from GitHub',
        createdOn: '2026-08-13T09:00:00.000Z',
        startedOn: '2026-08-13T09:00:02.000Z',
        stoppedOn: '2026-08-13T09:00:20.000Z',
      },
    ]);
    expect(fetcher.mock.calls[0]?.[0]).toContain(
      '/builds/workers/worker%2Ftag/builds?per_page=200',
    );
  });

  it('maps Worker versions back to their immutable Builds outputs', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: 'version-id',
              metadata: { created_on: '2026-08-13T09:00:20.000Z', hasPreview: true },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          builds: {
            'version-id': {
              build_uuid: 'build-id',
              status: 'stopped',
              build_outcome: 'success',
              created_on: '2026-08-13T09:00:00.000Z',
              build_trigger_metadata: {
                branch: 'feature/preview',
                build_trigger_source: 'pull_request',
                commit_hash: 'abcdef1234567',
                commit_message: 'Preview change',
              },
            },
          },
        }),
      );
    const client = new CloudflareClient({ token: 'token', accountId: 'account', fetcher });

    await expect(client.listWorkerVersions('worker/name', 40)).resolves.toEqual([
      {
        id: 'version-id',
        createdOn: '2026-08-13T09:00:20.000Z',
        hasPreview: true,
      },
    ]);
    const versionBuilds = await client.getBuildsByVersionIds(['version-id', 'version-id']);
    expect(versionBuilds).toHaveLength(1);
    expect(versionBuilds[0]?.versionId).toBe('version-id');
    expect(versionBuilds[0]?.build).toMatchObject({
      id: 'build-id',
      source: 'pull_request',
      branch: 'feature/preview',
    });
    expect(fetcher.mock.calls[0]?.[0]).toContain('/versions?per_page=20');
    expect(fetcher.mock.calls[1]?.[0]).toContain('version_ids=version-id');
  });

  it('surfaces Cloudflare error details with the response status', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 10000, message: 'Authentication error' }],
          messages: [],
          result: null,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new CloudflareClient({ token: 'bad-token', fetcher });

    await expect(client.listAccounts()).rejects.toMatchObject({
      name: 'CloudflareApiError',
      status: 403,
      message: 'Authentication error',
    });
  });

  it('provisions D1, KV, and R2 resources through their scoped endpoints', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ uuid: 'database-id', name: 'app-db' }))
      .mockResolvedValueOnce(response({ id: 'namespace-id', title: 'app-cache' }))
      .mockResolvedValueOnce(response({ name: 'app-files' }));
    const client = new CloudflareClient({ token: 'token', accountId: 'account', fetcher });

    await expect(client.createD1Database('app-db')).resolves.toEqual({
      id: 'database-id',
      name: 'app-db',
    });
    await expect(client.createKvNamespace('app-cache')).resolves.toEqual({
      id: 'namespace-id',
      name: 'app-cache',
    });
    await expect(client.createR2Bucket('app-files')).resolves.toEqual({
      id: 'app-files',
      name: 'app-files',
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.cloudflare.com/client/v4/accounts/account/d1/database',
      'https://api.cloudflare.com/client/v4/accounts/account/storage/kv/namespaces',
      'https://api.cloudflare.com/client/v4/accounts/account/r2/buckets',
    ]);
  });

  it('keeps secret build variables write-only and scoped to the trigger', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        API_TOKEN: {
          created_on: '2026-08-13T08:00:00.000Z',
          is_secret: true,
          value: null,
        },
      }),
    );
    const client = new CloudflareClient({ token: 'provider-token', accountId: 'account', fetcher });

    await expect(client.listBuildEnvironmentVariables('trigger/id')).resolves.toEqual([
      {
        key: 'API_TOKEN',
        isSecret: true,
        value: null,
        createdOn: '2026-08-13T08:00:00.000Z',
      },
    ]);
    expect(fetcher.mock.calls[0]?.[0]).toContain(
      '/builds/triggers/trigger%2Fid/environment_variables',
    );
  });

  it('writes runtime secrets only to the Worker secret endpoint', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ name: 'PAYMENT_API_KEY', type: 'secret_text' }));
    const client = new CloudflareClient({ token: 'provider-token', accountId: 'account', fetcher });

    await client.putWorkerSecret('checkout/worker', 'PAYMENT_API_KEY', 'value-never-returned');

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain('/workers/scripts/checkout%2Fworker/secrets');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBeTypeOf('string');
    expect(JSON.parse(init?.body as string)).toEqual({
      name: 'PAYMENT_API_KEY',
      text: 'value-never-returned',
      type: 'secret_text',
    });
  });

  it('creates a repository connection and production trigger with scoped identifiers', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          repo_connection_uuid: 'repository-connection',
          provider_type: 'github',
          provider_account_id: '101',
          provider_account_name: 'acme',
          repo_id: '1001',
          repo_name: 'checkout-api',
        }),
      )
      .mockResolvedValueOnce(
        response({
          trigger_uuid: 'production-trigger',
          trigger_name: 'WorkerDeck production',
          external_script_id: 'worker-tag',
          branch_includes: ['main'],
          branch_excludes: [],
        }),
      );
    const client = new CloudflareClient({ token: 'control-token', accountId: 'account', fetcher });

    const connection = await client.upsertRepositoryConnection({
      provider: 'github',
      providerAccountId: '101',
      providerAccountName: 'acme',
      repositoryId: '1001',
      repositoryName: 'checkout-api',
    });
    await client.createBuildTrigger({
      workerTag: 'worker-tag',
      repositoryConnectionId: connection.id,
      buildTokenId: 'build-token',
      name: 'WorkerDeck production',
      buildCommand: 'npm run build',
      deployCommand: 'npx wrangler deploy --name workerdeck-checkout-api',
      rootDirectory: '/',
      branchIncludes: ['main'],
      branchExcludes: [],
    });

    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({
      provider_type: 'github',
      provider_account_id: '101',
      provider_account_name: 'acme',
      repo_id: '1001',
      repo_name: 'checkout-api',
    });
    expect(JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      external_script_id: 'worker-tag',
      repo_connection_uuid: 'repository-connection',
      build_token_uuid: 'build-token',
      branch_includes: ['main'],
      path_includes: ['*'],
    });
    expect(fetcher.mock.calls[1]?.[1]?.body as string).not.toContain('control-token');
  });

  it('normalizes paged build log lines without exposing raw provider envelopes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        cursor: 'next-page',
        truncated: false,
        lines: [[1_723_500_000_000, 'Installing dependencies'], ['Build ready']],
      }),
    );
    const client = new CloudflareClient({ token: 'token', accountId: 'account', fetcher });

    await expect(client.getBuildLogs('build/id', 'cursor value')).resolves.toEqual({
      cursor: 'next-page',
      truncated: false,
      lines: [
        { timestamp: 1_723_500_000_000, message: 'Installing dependencies' },
        { timestamp: null, message: 'Build ready' },
      ],
    });
    expect(fetcher.mock.calls[0]?.[0]).toContain(
      '/builds/builds/build%2Fid/logs?cursor=cursor%20value',
    );
  });

  it('attaches a custom domain through the account-level Worker Domains API', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: 'domain-id',
        hostname: 'app.example.com',
        service: 'workerdeck-app',
        zone_id: 'zone-id',
        zone_name: 'example.com',
        cert_id: 'certificate-id',
      }),
    );
    const client = new CloudflareClient({ token: 'token', accountId: 'account', fetcher });

    await expect(client.attachWorkerDomain('app.example.com', 'workerdeck-app')).resolves.toEqual({
      id: 'domain-id',
      hostname: 'app.example.com',
      service: 'workerdeck-app',
      zoneId: 'zone-id',
      zoneName: 'example.com',
      certificateId: 'certificate-id',
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account/workers/domains',
    );
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({
      hostname: 'app.example.com',
      service: 'workerdeck-app',
    });
  });

  it('queries account Workers analytics and returns only managed Worker rows', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  workersInvocationsAdaptive: [
                    {
                      dimensions: {
                        datetime: '2026-08-13T08:00:00Z',
                        scriptName: 'workerdeck-api',
                        status: 'success',
                      },
                      sum: { requests: 12, errors: 1, subrequests: 4 },
                      quantiles: { cpuTimeP50: 2.5, cpuTimeP99: 18 },
                    },
                    {
                      dimensions: {
                        datetime: '2026-08-13T08:00:00Z',
                        scriptName: 'unmanaged-worker',
                        status: 'success',
                      },
                      sum: { requests: 99, errors: 0, subrequests: 0 },
                      quantiles: { cpuTimeP50: 1, cpuTimeP99: 2 },
                    },
                  ],
                },
              ],
            },
          },
          errors: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const client = new CloudflareClient({ token: 'token', accountId: 'account', fetcher });

    await expect(
      client.getWorkerAnalytics(
        ['workerdeck-api'],
        '2026-08-12T08:00:00.000Z',
        '2026-08-13T08:00:00.000Z',
      ),
    ).resolves.toEqual([
      {
        timestamp: '2026-08-13T08:00:00Z',
        workerName: 'workerdeck-api',
        status: 'success',
        requests: 12,
        errors: 1,
        subrequests: 4,
        cpuTimeP50: 2.5,
        cpuTimeP99: 18,
      },
    ]);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
    const body = JSON.parse(init?.body as string) as { variables: Record<string, unknown> };
    expect(body.variables).toEqual({
      accountTag: 'account',
      from: '2026-08-12T08:00:00.000Z',
      to: '2026-08-13T08:00:00.000Z',
      scriptName: 'workerdeck-api',
    });
    const query = JSON.parse(init?.body as string) as { query: string };
    expect(query.query).toContain('scriptName: $scriptName');
  });

  it('verifies D1 Time Travel bookmarks without invoking restore', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ bookmark: 'bookmark-id' }));
    const client = new CloudflareClient({ token: 'token', accountId: 'account', fetcher });

    await expect(client.getD1Bookmark('database/id', '2026-08-13T08:00:00.000Z')).resolves.toBe(
      'bookmark-id',
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain(
      '/d1/database/database%2Fid/time_travel/bookmark?timestamp=2026-08-13T08%3A00%3A00.000Z',
    );
    expect(init?.method).toBeUndefined();
    expect(url).not.toContain('/restore');
  });

  it('reads Workers Builds limit posture without inventing minute totals', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        has_reached_build_minutes_limit: false,
        build_minutes_refresh_on: '2026-09-01T00:00:00.000Z',
      }),
    );
    const client = new CloudflareClient({ token: 'token', accountId: 'account', fetcher });

    await expect(client.getBuildAccountLimits()).resolves.toEqual({
      limitReached: false,
      refreshesAt: '2026-09-01T00:00:00.000Z',
    });
  });
});
