import { z } from 'zod';
import type {
  BuildTrigger,
  BuildEnvironmentVariable,
  BuildLogs,
  BuildToken,
  CloudflareAccount,
  DurableObjectNamespace,
  HyperdriveOrigin,
  TriggerBuildInput,
  ProvisionedResource,
  VectorizeIndexConfig,
  WorkerBuild,
  WorkerDeployment,
  WorkerVersion,
  VersionBuild,
  WorkerDomain,
  WorkerScript,
  WorkerSecret,
  RepositoryConnection,
  CreateBuildTriggerInput,
  UpdateBuildTriggerInput,
  WorkerAnalyticsRow,
  WebAnalyticsRows,
  CloudflareZoneCacheRuleset,
  CloudflareAccessGroup,
  CloudflareEmailRoutingAddress,
  CloudflareEmailRoutingRule,
  CloudflareEmailRoutingStatus,
  CloudflareEmailRoutingCatchAll,
  BuildAccountLimits,
} from './types';

const envelopeSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(
      z.object({
        code: z.number().optional().default(0),
        message: z.string().optional().default('Unknown Cloudflare API error'),
      }),
    )
    .nullish()
    .transform((value) => value ?? []),
  messages: z
    .array(z.unknown())
    .nullish()
    .transform((value) => value ?? []),
  result: z.unknown(),
});

const accountSchema = z.object({ id: z.string(), name: z.string() });

const workerBuildSchema = z
  .object({
    build_uuid: z.string(),
    status: z.enum(['queued', 'initializing', 'running', 'stopped']),
    build_outcome: z
      .enum(['success', 'fail', 'skipped', 'cancelled', 'terminated'])
      .nullish()
      .transform((value) => value ?? null),
    created_on: z.string(),
    running_on: z.string().nullish(),
    stopped_on: z.string().nullish(),
    build_trigger_metadata: z
      .object({
        author: z.string().nullish(),
        branch: z.string().nullish(),
        build_trigger_source: z.enum(['push', 'pull_request', 'manual', 'api']).nullish(),
        commit_hash: z.string().nullish(),
        commit_message: z.string().nullish(),
      })
      .nullish(),
    trigger: z.object({ trigger_uuid: z.string().nullish() }).nullish(),
  })
  .transform((build): WorkerBuild => ({
    id: build.build_uuid,
    status: build.status,
    outcome: build.build_outcome,
    source: build.build_trigger_metadata?.build_trigger_source ?? null,
    author: build.build_trigger_metadata?.author ?? null,
    triggerId: build.trigger?.trigger_uuid ?? null,
    branch: build.build_trigger_metadata?.branch ?? null,
    commitSha: build.build_trigger_metadata?.commit_hash ?? null,
    commitMessage: build.build_trigger_metadata?.commit_message ?? null,
    createdOn: build.created_on,
    startedOn: build.running_on ?? null,
    stoppedOn: build.stopped_on ?? null,
  }));

const triggeredBuildSchema = z
  .object({
    build_uuid: z.string(),
    created_on: z.string(),
    status: z.enum(['queued', 'initializing', 'running', 'stopped']).optional().default('queued'),
  })
  .transform((build): WorkerBuild => ({
    id: build.build_uuid,
    status: build.status,
    outcome: null,
    source: 'api',
    author: null,
    triggerId: null,
    branch: null,
    commitSha: null,
    commitMessage: null,
    createdOn: build.created_on,
    startedOn: null,
    stoppedOn: null,
  }));

const workerVersionSchema = z
  .object({
    id: z.string(),
    metadata: z
      .object({
        created_on: z.string().nullish(),
        hasPreview: z.boolean().nullish(),
        has_preview: z.boolean().nullish(),
      })
      .nullish(),
  })
  .transform((version): WorkerVersion => ({
    id: version.id,
    createdOn: version.metadata?.created_on ?? new Date(0).toISOString(),
    hasPreview: version.metadata?.has_preview ?? version.metadata?.hasPreview ?? false,
  }));

export class CloudflareApiError extends Error {
  readonly status: number;
  readonly errors: Array<{ code: number; message: string }>;

  constructor(
    message: string,
    status: number,
    errors: Array<{ code: number; message: string }> = [],
  ) {
    super(message);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.errors = errors;
  }
}

export interface CloudflareClientOptions {
  token: string;
  accountId?: string;
  fetcher?: typeof fetch;
  baseUrl?: string;
}

export class CloudflareClient {
  readonly #token: string;
  readonly #accountId: string | undefined;
  readonly #fetcher: typeof fetch;
  readonly #baseUrl: string;

  constructor(options: CloudflareClientOptions) {
    this.#token = options.token;
    this.#accountId = options.accountId;
    this.#fetcher = options.fetcher ?? ((...arguments_) => fetch(...arguments_));
    this.#baseUrl = options.baseUrl ?? 'https://api.cloudflare.com/client/v4';
  }

  async listAccounts(): Promise<CloudflareAccount[]> {
    return this.#request('/accounts', z.array(accountSchema));
  }

  async getWorkerAnalytics(
    workerNames: string[],
    from: string,
    to: string,
    includeTimeseries = true,
  ): Promise<WorkerAnalyticsRow[]> {
    const accountId = this.#requireAccountId();
    if (workerNames.length === 0) return [];
    const workerNameSet = new Set(workerNames);
    const rowSchema = z.object({
      dimensions: z.object({
        datetime: z.string().optional(),
        scriptName: z.string(),
        status: z.string(),
      }),
      sum: z.object({
        requests: z.number().nonnegative(),
        errors: z.number().nonnegative(),
        subrequests: z.number().nonnegative(),
      }),
      quantiles: z.object({
        cpuTimeP50: z.number().nonnegative().nullish(),
        cpuTimeP99: z.number().nonnegative().nullish(),
      }),
    });
    const dimensions = includeTimeseries ? 'datetime scriptName status' : 'scriptName status';
    const scopedToOneWorker = workerNames.length === 1;
    const scriptVariable = scopedToOneWorker ? ', $scriptName: string' : '';
    const scriptFilter = scopedToOneWorker ? 'scriptName: $scriptName,' : '';
    const result = await this.#graphql(
      `query WorkerDeckAnalytics($accountTag: string, $from: string, $to: string${scriptVariable}) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            workersInvocationsAdaptive(
              limit: 10000
              filter: { ${scriptFilter} datetime_geq: $from, datetime_leq: $to }
            ) {
              sum { requests errors subrequests }
              quantiles { cpuTimeP50 cpuTimeP99 }
              dimensions { ${dimensions} }
            }
          }
        }
      }`,
      {
        accountTag: accountId,
        from,
        to,
        ...(scopedToOneWorker ? { scriptName: workerNames[0] } : {}),
      },
      z.object({
        viewer: z.object({
          accounts: z.array(z.object({ workersInvocationsAdaptive: z.array(rowSchema) })),
        }),
      }),
    );
    return (result.viewer.accounts[0]?.workersInvocationsAdaptive ?? [])
      .filter((row) => workerNameSet.has(row.dimensions.scriptName))
      .map((row) => ({
        timestamp: row.dimensions.datetime ?? to,
        workerName: row.dimensions.scriptName,
        status: row.dimensions.status,
        requests: row.sum.requests,
        errors: row.sum.errors,
        subrequests: row.sum.subrequests,
        cpuTimeP50: row.quantiles.cpuTimeP50 ?? null,
        cpuTimeP99: row.quantiles.cpuTimeP99 ?? null,
      }));
  }

  async getWebAnalytics(from: string, to: string, hostnames: string[]): Promise<WebAnalyticsRows> {
    const accountId = this.#requireAccountId();
    if (hostnames.length === 0) return { pageViews: [], vitals: [] };
    const hostnameSet = new Set(hostnames.map((hostname) => hostname.toLowerCase()));
    const pageViewRowSchema = z.object({
      dimensions: z.object({
        requestHost: z.string(),
        requestPath: z.string().nullish(),
      }),
      count: z.number().nonnegative(),
      sum: z.object({ visits: z.number().nonnegative() }),
    });
    const vitalsRowSchema = z.object({
      dimensions: z.object({ requestHost: z.string() }),
      quantiles: z.object({
        largestContentfulPaintP75: z.number().nonnegative().nullish(),
        interactionToNextPaintP75: z.number().nonnegative().nullish(),
        cumulativeLayoutShiftP75: z.number().nonnegative().nullish(),
        firstContentfulPaintP75: z.number().nonnegative().nullish(),
        timeToFirstByteP75: z.number().nonnegative().nullish(),
      }),
    });
    const result = await this.#graphql(
      `query WorkerDeckWebAnalytics($accountTag: string, $from: string, $to: string) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            pageViews: rumPageloadEventsAdaptiveGroups(
              limit: 10000
              filter: { datetime_geq: $from, datetime_leq: $to }
            ) {
              count
              sum { visits }
              dimensions { requestHost requestPath }
            }
            vitals: rumWebVitalsEventsAdaptiveGroups(
              limit: 10000
              filter: { datetime_geq: $from, datetime_leq: $to }
            ) {
              quantiles {
                largestContentfulPaintP75
                interactionToNextPaintP75
                cumulativeLayoutShiftP75
                firstContentfulPaintP75
                timeToFirstByteP75
              }
              dimensions { requestHost }
            }
          }
        }
      }`,
      { accountTag: accountId, from, to },
      z.object({
        viewer: z.object({
          accounts: z.array(
            z.object({
              pageViews: z.array(pageViewRowSchema),
              vitals: z.array(vitalsRowSchema),
            }),
          ),
        }),
      }),
    );
    const datasets = result.viewer.accounts[0] ?? { pageViews: [], vitals: [] };
    return {
      pageViews: datasets.pageViews
        .filter((row) => hostnameSet.has(row.dimensions.requestHost.toLowerCase()))
        .map((row) => ({
          hostname: row.dimensions.requestHost.toLowerCase(),
          path: row.dimensions.requestPath ?? '/',
          pageViews: row.count,
          visits: row.sum.visits,
        })),
      vitals: datasets.vitals
        .filter((row) => hostnameSet.has(row.dimensions.requestHost.toLowerCase()))
        .map((row) => ({
          hostname: row.dimensions.requestHost.toLowerCase(),
          lcpP75: row.quantiles.largestContentfulPaintP75 ?? null,
          inpP75: row.quantiles.interactionToNextPaintP75 ?? null,
          clsP75: row.quantiles.cumulativeLayoutShiftP75 ?? null,
          fcpP75: row.quantiles.firstContentfulPaintP75 ?? null,
          ttfbP75: row.quantiles.timeToFirstByteP75 ?? null,
        })),
    };
  }

  async getBuildAccountLimits(): Promise<BuildAccountLimits> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/builds/account/limits`,
      z
        .object({
          has_reached_build_minutes_limit: z.boolean().nullish(),
          build_minutes_refresh_on: z.string().nullish(),
        })
        .transform((limits) => ({
          limitReached: limits.has_reached_build_minutes_limit ?? null,
          refreshesAt: limits.build_minutes_refresh_on ?? null,
        })),
    );
  }

  async getD1Bookmark(databaseId: string, timestamp?: string): Promise<string> {
    const accountId = this.#requireAccountId();
    const query = timestamp ? `?timestamp=${encodeURIComponent(timestamp)}` : '';
    const result = await this.#request(
      `/accounts/${accountId}/d1/database/${encodeURIComponent(databaseId)}/time_travel/bookmark${query}`,
      z.object({ bookmark: z.string().min(1) }),
    );
    return result.bookmark;
  }

  async listWorkers(): Promise<WorkerScript[]> {
    const accountId = this.#requireAccountId();
    const schema = z.array(
      z
        .object({
          id: z.string(),
          tag: z.string().optional().default(''),
          created_on: z.string(),
          modified_on: z.string(),
          last_deployed_from: z.string().optional().default('unknown'),
        })
        .transform((worker) => ({
          id: worker.id,
          tag: worker.tag,
          createdOn: worker.created_on,
          modifiedOn: worker.modified_on,
          lastDeployedFrom: worker.last_deployed_from,
        })),
    );
    return this.#request(`/accounts/${accountId}/workers/scripts`, schema);
  }

  async bootstrapWorker(scriptName: string, compatibilityDate: string): Promise<WorkerScript> {
    const accountId = this.#requireAccountId();
    const form = new FormData();
    form.set(
      'metadata',
      new Blob(
        [
          JSON.stringify({
            main_module: 'worker.js',
            compatibility_date: compatibilityDate,
            annotations: {
              'workers/message': 'WorkerDeck bootstrap. Replaced by the first successful build.',
              'workers/tag': 'workerdeck-bootstrap',
            },
          }),
        ],
        { type: 'application/json' },
      ),
    );
    form.set(
      'worker.js',
      new Blob(
        [
          "export default { fetch() { return new Response('Deployment is being prepared.', { status: 503, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' } }); } };",
        ],
        { type: 'application/javascript+module' },
      ),
      'worker.js',
    );
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}`,
      z.unknown(),
      { method: 'PUT', body: form },
    );
    const worker = (await this.listWorkers()).find((candidate) => candidate.id === scriptName);
    if (!worker?.tag) {
      throw new CloudflareApiError(
        'Cloudflare created the Worker but did not return its immutable tag.',
        502,
      );
    }
    return worker;
  }

  async enableWorkerSubdomain(scriptName: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`,
      z.unknown(),
      { method: 'POST', body: JSON.stringify({ enabled: true, previews_enabled: true }) },
    );
  }

  async setWorkerSubdomainEnabled(scriptName: string, enabled: boolean): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`,
      z.unknown(),
      { method: 'PUT', body: JSON.stringify({ enabled, previews_enabled: enabled }) },
    );
  }

  async getWorkersSubdomain(): Promise<string> {
    const accountId = this.#requireAccountId();
    const result = await this.#request(
      `/accounts/${accountId}/workers/subdomain`,
      z.object({ subdomain: z.string().trim().min(1) }),
    );
    return result.subdomain;
  }

  async deleteWorker(scriptName: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async listWorkerDomains(service?: string): Promise<WorkerDomain[]> {
    const accountId = this.#requireAccountId();
    const query = service ? `?service=${encodeURIComponent(service)}` : '';
    return this.#request(
      `/accounts/${accountId}/workers/domains${query}`,
      z.array(workerDomainSchema),
    );
  }

  async attachWorkerDomain(hostname: string, service: string): Promise<WorkerDomain> {
    const accountId = this.#requireAccountId();
    return this.#request(`/accounts/${accountId}/workers/domains`, workerDomainSchema, {
      method: 'PUT',
      body: JSON.stringify({ hostname, service }),
    });
  }

  async detachWorkerDomain(domainId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/domains/${encodeURIComponent(domainId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async listZoneCacheRules(zoneId: string): Promise<CloudflareZoneCacheRuleset | null> {
    try {
      return await this.#request(
        `/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`,
        z.object({ id: z.string(), rules: z.array(z.record(z.string(), z.unknown())) }),
      );
    } catch (error) {
      if (error instanceof CloudflareApiError && error.status === 404) return null;
      throw error;
    }
  }

  async setZoneCacheRules(zoneId: string, rules: Array<Record<string, unknown>>): Promise<void> {
    const existing = await this.listZoneCacheRules(zoneId);
    if (existing) {
      await this.#request(
        `/zones/${zoneId}/rulesets/${encodeURIComponent(existing.id)}`,
        z.unknown(),
        { method: 'PUT', body: JSON.stringify({ rules }) },
      );
      return;
    }
    await this.#request(`/zones/${zoneId}/rulesets`, z.unknown(), {
      method: 'POST',
      body: JSON.stringify({
        name: 'default',
        kind: 'zone',
        phase: 'http_request_cache_settings',
        rules,
      }),
    });
  }

  async purgeZoneCache(zoneId: string): Promise<{ id: string }> {
    return this.#request(`/zones/${zoneId}/purge_cache`, z.object({ id: z.string() }), {
      method: 'POST',
      body: JSON.stringify({ purge_everything: true }),
    });
  }

  async listAccessGroups(name?: string): Promise<CloudflareAccessGroup[]> {
    const accountId = this.#requireAccountId();
    const query = name ? `?name=${encodeURIComponent(name)}` : '';
    return this.#request(
      `/accounts/${accountId}/access/groups${query}`,
      z.array(z.object({ id: z.string(), name: z.string() })),
    );
  }

  async createAccessGroup(name: string, emails: string[]): Promise<CloudflareAccessGroup> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/access/groups`,
      z.object({ id: z.string(), name: z.string() }),
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          include: emails.map((email) => ({ email: { email } })),
        }),
      },
    );
  }

  async updateAccessGroup(groupId: string, emails: string[]): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/access/groups/${encodeURIComponent(groupId)}`,
      z.unknown(),
      {
        method: 'PUT',
        body: JSON.stringify({ include: emails.map((email) => ({ email: { email } })) }),
      },
    );
  }

  async deleteAccessGroup(groupId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/access/groups/${encodeURIComponent(groupId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async listEmailRoutingDestinationAddresses(): Promise<CloudflareEmailRoutingAddress[]> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/email/routing/addresses`,
      z.array(emailRoutingAddressSchema),
    );
  }

  async createEmailRoutingDestinationAddress(
    email: string,
  ): Promise<CloudflareEmailRoutingAddress> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/email/routing/addresses`,
      emailRoutingAddressSchema,
      { method: 'POST', body: JSON.stringify({ email }) },
    );
  }

  async getEmailRoutingSettings(
    zoneId: string,
    zoneName?: string,
  ): Promise<CloudflareEmailRoutingStatus> {
    try {
      return await this.#request(`/zones/${zoneId}/email/routing`, emailRoutingSettingsSchema);
    } catch (error) {
      if (error instanceof CloudflareApiError && (error.status === 404 || error.status === 400)) {
        return { enabled: false, status: 'disabled', domain: zoneName ?? null };
      }
      throw error;
    }
  }

  async setEmailRoutingSettings(
    zoneId: string,
    enabled: boolean,
  ): Promise<CloudflareEmailRoutingStatus> {
    return this.#request(`/zones/${zoneId}/email/routing`, emailRoutingSettingsSchema, {
      method: 'PUT',
      body: JSON.stringify(enabled ? { enabled: true, skip_wizard: true } : { enabled: false }),
    });
  }

  async listEmailRoutingRules(zoneId: string): Promise<CloudflareEmailRoutingRule[]> {
    return this.#request(`/zones/${zoneId}/email/routing/rules`, z.array(emailRoutingRuleSchema));
  }

  async createEmailRoutingRule(
    zoneId: string,
    input: { matcherEmail: string; destinationEmail: string; enabled: boolean },
  ): Promise<CloudflareEmailRoutingRule> {
    return this.#request(`/zones/${zoneId}/email/routing/rules`, emailRoutingRuleSchema, {
      method: 'POST',
      body: JSON.stringify({
        actions: [{ type: 'forward', value: [input.destinationEmail] }],
        matchers: [{ type: 'literal', field: 'to', value: input.matcherEmail }],
        enabled: input.enabled,
      }),
    });
  }

  async updateEmailRoutingRule(
    zoneId: string,
    ruleId: string,
    enabled: boolean,
  ): Promise<CloudflareEmailRoutingRule> {
    const existing = await this.#request(
      `/zones/${zoneId}/email/routing/rules/${encodeURIComponent(ruleId)}`,
      z.object({
        actions: z
          .array(emailRoutingActionSchema)
          .nullish()
          .transform((value) => value ?? []),
        matchers: z
          .array(emailRoutingMatcherSchema)
          .nullish()
          .transform((value) => value ?? []),
        enabled: z.boolean(),
        name: z.string().nullish(),
        priority: z.number().nullish(),
      }),
    );
    return this.#request(
      `/zones/${zoneId}/email/routing/rules/${encodeURIComponent(ruleId)}`,
      emailRoutingRuleSchema,
      {
        method: 'PUT',
        body: JSON.stringify({
          actions: existing.actions,
          matchers: existing.matchers,
          enabled,
          ...(existing.name === null ? {} : { name: existing.name }),
          ...(existing.priority === null ? {} : { priority: existing.priority }),
        }),
      },
    );
  }

  async deleteEmailRoutingRule(zoneId: string, ruleId: string): Promise<void> {
    await this.#request(
      `/zones/${zoneId}/email/routing/rules/${encodeURIComponent(ruleId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async getEmailRoutingCatchAll(zoneId: string): Promise<CloudflareEmailRoutingCatchAll | null> {
    try {
      return await this.#request(
        `/zones/${zoneId}/email/routing/rules/catch_all`,
        emailRoutingCatchAllSchema,
      );
    } catch (error) {
      if (error instanceof CloudflareApiError && error.status === 404) return null;
      throw error;
    }
  }

  async setEmailRoutingCatchAll(
    zoneId: string,
    enabled: boolean,
    destinationEmail: string | null,
  ): Promise<CloudflareEmailRoutingCatchAll> {
    const existing = await this.getEmailRoutingCatchAll(zoneId);
    if (!enabled && !existing) {
      return { enabled: false, destinationEmail: null };
    }
    const forwardValue = enabled
      ? (destinationEmail ?? existing?.destinationEmail ?? '')
      : (existing?.destinationEmail ?? '');
    if (enabled && !forwardValue) {
      throw new Error('A destination address is required to enable the catch-all rule.');
    }
    return this.#request(
      `/zones/${zoneId}/email/routing/rules/catch_all`,
      emailRoutingCatchAllSchema,
      {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          actions: forwardValue ? [{ type: 'forward', value: [forwardValue] }] : [],
          matchers: [{ type: 'all' }],
        }),
      },
    );
  }

  async writeKvValue(namespaceId: string, key: string, value: string): Promise<void> {
    const accountId = this.#requireAccountId();
    const response = await this.#fetcher(
      `${this.#baseUrl}/accounts/${accountId}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(key)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.#token}`,
          'Content-Type': 'text/plain',
          'User-Agent': 'WorkerDeck/0.0.0',
        },
        body: value,
      },
    );
    if (!response.ok) {
      throw new CloudflareApiError(
        `Cloudflare KV write failed with status ${response.status}.`,
        response.status,
      );
    }
  }

  async readKvValue(namespaceId: string, key: string): Promise<string | null> {
    const accountId = this.#requireAccountId();
    const response = await this.#fetcher(
      `${this.#baseUrl}/accounts/${accountId}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(key)}`,
      {
        headers: {
          Authorization: `Bearer ${this.#token}`,
          'User-Agent': 'WorkerDeck/0.0.0',
        },
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new CloudflareApiError(
        `Cloudflare KV read failed with status ${response.status}.`,
        response.status,
      );
    }
    return response.text();
  }

  async upsertRepositoryConnection(input: {
    provider: 'github' | 'gitlab';
    providerAccountId: string;
    providerAccountName: string;
    repositoryId: string;
    repositoryName: string;
  }): Promise<RepositoryConnection> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/builds/repos/connections`,
      z
        .object({
          repo_connection_uuid: z.string(),
          provider_type: z.enum(['github', 'gitlab', 'gitlab_internal']),
          provider_account_id: z.string(),
          provider_account_name: z.string(),
          repo_id: z.string(),
          repo_name: z.string(),
        })
        .transform((connection) => ({
          id: connection.repo_connection_uuid,
          provider: connection.provider_type,
          providerAccountId: connection.provider_account_id,
          providerAccountName: connection.provider_account_name,
          repositoryId: connection.repo_id,
          repositoryName: connection.repo_name,
        })),
      {
        method: 'PUT',
        body: JSON.stringify({
          provider_type: input.provider,
          provider_account_id: input.providerAccountId,
          provider_account_name: input.providerAccountName,
          repo_id: input.repositoryId,
          repo_name: input.repositoryName,
        }),
      },
    );
  }

  async listBuildTokens(): Promise<BuildToken[]> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/builds/tokens`,
      z.array(
        z
          .object({
            build_token_uuid: z.string(),
            build_token_name: z.string().optional().default('Build token'),
            cloudflare_token_id: z.string().nullish(),
            owner_type: z.string().nullish(),
          })
          .transform((token) => ({
            id: token.build_token_uuid,
            name: token.build_token_name,
            cloudflareTokenId: token.cloudflare_token_id ?? null,
            ownerType: token.owner_type ?? null,
          })),
      ),
    );
  }

  async createBuildToken(input: {
    name: string;
    secret: string;
    cloudflareTokenId: string;
  }): Promise<BuildToken> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/builds/tokens`,
      z
        .object({
          build_token_uuid: z.string(),
          build_token_name: z.string().optional().default(input.name),
          cloudflare_token_id: z.string().nullish(),
          owner_type: z.string().nullish(),
        })
        .transform((token) => ({
          id: token.build_token_uuid,
          name: token.build_token_name,
          cloudflareTokenId: token.cloudflare_token_id ?? null,
          ownerType: token.owner_type ?? null,
        })),
      {
        method: 'POST',
        body: JSON.stringify({
          build_token_name: input.name,
          build_token_secret: input.secret,
          cloudflare_token_id: input.cloudflareTokenId,
        }),
      },
    );
  }

  async createBuildTrigger(input: CreateBuildTriggerInput): Promise<BuildTrigger> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/builds/triggers`,
      z
        .object({
          trigger_uuid: z.string(),
          trigger_name: z.string(),
          external_script_id: z.string(),
          build_command: z.string().nullish(),
          deploy_command: z.string().nullish(),
          branch_includes: z.array(z.string()).optional().default([]),
          branch_excludes: z.array(z.string()).optional().default([]),
        })
        .transform((trigger) => ({
          id: trigger.trigger_uuid,
          name: trigger.trigger_name,
          workerTag: trigger.external_script_id,
          buildCommand: trigger.build_command ?? null,
          deployCommand: trigger.deploy_command ?? null,
          branchIncludes: trigger.branch_includes,
          branchExcludes: trigger.branch_excludes,
        })),
      {
        method: 'POST',
        body: JSON.stringify({
          external_script_id: input.workerTag,
          repo_connection_uuid: input.repositoryConnectionId,
          build_token_uuid: input.buildTokenId,
          trigger_name: input.name,
          build_command: input.buildCommand,
          deploy_command: input.deployCommand,
          root_directory: input.rootDirectory,
          branch_includes: input.branchIncludes,
          branch_excludes: input.branchExcludes,
          path_includes: ['*'],
          path_excludes: [],
          build_caching_enabled: true,
        }),
      },
    );
  }

  async updateBuildTrigger(
    triggerId: string,
    input: UpdateBuildTriggerInput,
  ): Promise<BuildTrigger> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/builds/triggers/${encodeURIComponent(triggerId)}`,
      z
        .object({
          trigger_uuid: z.string(),
          trigger_name: z.string(),
          external_script_id: z.string(),
          build_command: z.string().nullish(),
          deploy_command: z.string().nullish(),
          branch_includes: z.array(z.string()).optional().default([]),
          branch_excludes: z.array(z.string()).optional().default([]),
        })
        .transform((trigger) => ({
          id: trigger.trigger_uuid,
          name: trigger.trigger_name,
          workerTag: trigger.external_script_id,
          buildCommand: trigger.build_command ?? null,
          deployCommand: trigger.deploy_command ?? null,
          branchIncludes: trigger.branch_includes,
          branchExcludes: trigger.branch_excludes,
        })),
      {
        method: 'PATCH',
        body: JSON.stringify({
          ...(input.name === undefined ? {} : { trigger_name: input.name }),
          ...(input.buildCommand === undefined ? {} : { build_command: input.buildCommand }),
          ...(input.deployCommand === undefined ? {} : { deploy_command: input.deployCommand }),
          ...(input.rootDirectory === undefined ? {} : { root_directory: input.rootDirectory }),
          ...(input.branchIncludes === undefined ? {} : { branch_includes: input.branchIncludes }),
          ...(input.branchExcludes === undefined ? {} : { branch_excludes: input.branchExcludes }),
        }),
      },
    );
  }

  async deleteBuildTrigger(triggerId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/builds/triggers/${encodeURIComponent(triggerId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async listBuildTriggers(workerTag: string): Promise<BuildTrigger[]> {
    const accountId = this.#requireAccountId();
    const schema = z.array(
      z
        .object({
          trigger_uuid: z.string(),
          trigger_name: z.string(),
          external_script_id: z.string(),
          build_command: z.string().nullish(),
          deploy_command: z.string().nullish(),
          branch_includes: z.array(z.string()).default([]),
          branch_excludes: z.array(z.string()).default([]),
        })
        .transform((trigger) => ({
          id: trigger.trigger_uuid,
          name: trigger.trigger_name,
          workerTag: trigger.external_script_id,
          buildCommand: trigger.build_command ?? null,
          deployCommand: trigger.deploy_command ?? null,
          branchIncludes: trigger.branch_includes,
          branchExcludes: trigger.branch_excludes,
        })),
    );
    return this.#request(
      `/accounts/${accountId}/builds/workers/${encodeURIComponent(workerTag)}/triggers`,
      schema,
    );
  }

  async triggerBuild(triggerId: string, input: TriggerBuildInput): Promise<WorkerBuild> {
    const accountId = this.#requireAccountId();
    if (!input.branch && !input.commitSha) {
      throw new Error('A branch or commit SHA is required to trigger a build.');
    }
    return this.#request(
      `/accounts/${accountId}/builds/triggers/${encodeURIComponent(triggerId)}/builds`,
      triggeredBuildSchema,
      {
        method: 'POST',
        body: JSON.stringify({
          ...(input.branch ? { branch: input.branch } : {}),
          ...(input.commitSha ? { commit_hash: input.commitSha } : {}),
        }),
      },
    );
  }

  async listBuildEnvironmentVariables(triggerId: string): Promise<BuildEnvironmentVariable[]> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/builds/triggers/${encodeURIComponent(triggerId)}/environment_variables`,
      z
        .record(
          z.string(),
          z.object({
            created_on: z.string(),
            is_secret: z.boolean(),
            value: z.string().nullish(),
          }),
        )
        .transform((variables) =>
          Object.entries(variables).map(([key, variable]) => ({
            key,
            isSecret: variable.is_secret,
            value: variable.value ?? null,
            createdOn: variable.created_on,
          })),
        ),
    );
  }

  async upsertBuildEnvironmentVariable(
    triggerId: string,
    key: string,
    value: string,
    isSecret: boolean,
  ): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/builds/triggers/${encodeURIComponent(triggerId)}/environment_variables`,
      z.unknown(),
      {
        method: 'PATCH',
        body: JSON.stringify({ [key]: { value, is_secret: isSecret } }),
      },
    );
  }

  async deleteBuildEnvironmentVariable(triggerId: string, key: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/builds/triggers/${encodeURIComponent(triggerId)}/environment_variables/${encodeURIComponent(key)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async listWorkerSecrets(scriptName: string): Promise<WorkerSecret[]> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`,
      z.array(
        z.object({
          name: z.string(),
          type: z.enum(['secret_text', 'secret_key']),
        }),
      ),
    );
  }

  async putWorkerSecret(scriptName: string, name: string, value: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`,
      z.unknown(),
      {
        method: 'PUT',
        body: JSON.stringify({ name, text: value, type: 'secret_text' }),
      },
    );
  }

  async deleteWorkerSecret(scriptName: string, name: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/secrets/${encodeURIComponent(name)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async getBuild(buildId: string): Promise<WorkerBuild> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/builds/builds/${encodeURIComponent(buildId)}`,
      workerBuildSchema,
    );
  }

  async listBuilds(workerTag: string, perPage = 50): Promise<WorkerBuild[]> {
    const accountId = this.#requireAccountId();
    const boundedPerPage = Math.max(1, Math.min(perPage, 200));
    return this.#request(
      `/accounts/${accountId}/builds/workers/${encodeURIComponent(workerTag)}/builds?per_page=${boundedPerPage}`,
      z.array(workerBuildSchema),
    );
  }

  async listWorkerVersions(scriptName: string, perPage = 20): Promise<WorkerVersion[]> {
    const accountId = this.#requireAccountId();
    const boundedPerPage = Math.max(1, Math.min(perPage, 20));
    return this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/versions?per_page=${boundedPerPage}`,
      z.union([
        z.array(workerVersionSchema),
        z
          .object({ items: z.array(workerVersionSchema).optional().default([]) })
          .transform((result) => result.items),
      ]),
    );
  }

  async getBuildsByVersionIds(versionIds: string[]): Promise<VersionBuild[]> {
    const accountId = this.#requireAccountId();
    const uniqueVersionIds = [...new Set(versionIds)].slice(0, 20);
    if (uniqueVersionIds.length === 0) return [];
    return this.#request(
      `/accounts/${accountId}/builds/builds?version_ids=${encodeURIComponent(uniqueVersionIds.join(','))}`,
      z
        .object({ builds: z.record(z.string(), workerBuildSchema).optional().default({}) })
        .transform((result) =>
          Object.entries(result.builds).map(([versionId, build]): VersionBuild => ({
            versionId,
            build,
          })),
        ),
    );
  }

  async getBuildLogs(buildId: string, cursor?: string): Promise<BuildLogs> {
    const accountId = this.#requireAccountId();
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.#request(
      `/accounts/${accountId}/builds/builds/${encodeURIComponent(buildId)}/logs${query}`,
      z
        .object({
          cursor: z.string().nullish(),
          truncated: z.boolean().optional().default(false),
          lines: z
            .array(z.array(z.union([z.number(), z.string()])))
            .optional()
            .default([]),
        })
        .transform((result) => ({
          cursor: result.cursor ?? null,
          truncated: result.truncated,
          lines: result.lines.map((line) => ({
            timestamp: typeof line[0] === 'number' ? line[0] : null,
            message: line
              .slice(typeof line[0] === 'number' ? 1 : 0)
              .map(String)
              .join(' '),
          })),
        })),
    );
  }

  async cancelBuild(buildId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/builds/builds/${encodeURIComponent(buildId)}/cancel`,
      z.unknown(),
      { method: 'PUT' },
    );
  }

  async createD1Database(name: string): Promise<ProvisionedResource> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/d1/database`,
      z
        .object({ uuid: z.string(), name: z.string() })
        .transform((database) => ({ id: database.uuid, name: database.name })),
      { method: 'POST', body: JSON.stringify({ name }) },
    );
  }

  async createKvNamespace(name: string): Promise<ProvisionedResource> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/storage/kv/namespaces`,
      z
        .object({ id: z.string(), title: z.string() })
        .transform((namespace) => ({ id: namespace.id, name: namespace.title })),
      { method: 'POST', body: JSON.stringify({ title: name }) },
    );
  }

  async createR2Bucket(name: string): Promise<ProvisionedResource> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/r2/buckets`,
      z
        .object({ name: z.string() })
        .transform((bucket) => ({ id: bucket.name, name: bucket.name })),
      { method: 'POST', body: JSON.stringify({ name }) },
    );
  }

  async deleteD1Database(databaseId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/d1/database/${encodeURIComponent(databaseId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async deleteKvNamespace(namespaceId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async deleteR2Bucket(name: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/r2/buckets/${encodeURIComponent(name)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async createHyperdrive(name: string, origin: HyperdriveOrigin): Promise<ProvisionedResource> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/hyperdrive/configs`,
      z
        .object({ id: z.string(), name: z.string() })
        .transform((config) => ({ id: config.id, name: config.name })),
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          origin: {
            database: origin.database,
            host: origin.host,
            password: origin.password,
            port: origin.port,
            scheme: origin.scheme,
            user: origin.user,
          },
        }),
      },
    );
  }

  async deleteHyperdrive(configId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/hyperdrive/configs/${encodeURIComponent(configId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async createVectorizeIndex(
    name: string,
    config: VectorizeIndexConfig,
  ): Promise<ProvisionedResource> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/vectorize/v2/indexes`,
      z.object({ name: z.string() }).transform((index) => ({ id: index.name, name: index.name })),
      {
        method: 'POST',
        body: JSON.stringify({ name, config: { ...config } }),
      },
    );
  }

  async deleteVectorizeIndex(name: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/vectorize/v2/indexes/${encodeURIComponent(name)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async createAiGateway(input: {
    id: string;
    cacheTtl?: number;
    collectLogs?: boolean;
  }): Promise<ProvisionedResource> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/ai-gateway/gateways`,
      z.object({ id: z.string() }).transform((gateway) => ({ id: gateway.id, name: gateway.id })),
      {
        method: 'POST',
        body: JSON.stringify({
          id: input.id,
          cache_invalidate_on_update: false,
          cache_ttl: input.cacheTtl ?? 0,
          collect_logs: input.collectLogs ?? true,
          rate_limiting_interval: 0,
          rate_limiting_limit: 0,
        }),
      },
    );
  }

  async deleteAiGateway(gatewayId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/ai-gateway/gateways/${encodeURIComponent(gatewayId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async createQueue(name: string): Promise<ProvisionedResource> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/queues`,
      z
        .object({ queue_id: z.string(), queue_name: z.string() })
        .transform((queue) => ({ id: queue.queue_id, name: queue.queue_name })),
      { method: 'POST', body: JSON.stringify({ queue_name: name }) },
    );
  }

  async deleteQueue(queueId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/queues/${encodeURIComponent(queueId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async createWorkflow(input: {
    name: string;
    className: string;
    scriptName: string;
  }): Promise<ProvisionedResource> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/workflows/${encodeURIComponent(input.name)}`,
      z
        .object({ id: z.string(), name: z.string() })
        .transform((workflow) => ({ id: workflow.id, name: workflow.name })),
      {
        method: 'PUT',
        body: JSON.stringify({
          class_name: input.className,
          script_name: input.scriptName,
        }),
      },
    );
  }

  async deleteWorkflow(name: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workflows/${encodeURIComponent(name)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async listDurableObjectNamespaces(): Promise<DurableObjectNamespace[]> {
    const accountId = this.#requireAccountId();
    return this.#request(
      `/accounts/${accountId}/workers/durable_objects/namespaces`,
      z.array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            class: z.string().optional().default(''),
            script: z.string().optional().default(''),
          })
          .transform((namespace) => ({
            id: namespace.id,
            name: namespace.name,
            className: namespace.class,
            scriptName: namespace.script,
          })),
      ),
    );
  }

  async listDeployments(scriptName: string): Promise<WorkerDeployment[]> {
    const accountId = this.#requireAccountId();
    const schema = z
      .object({
        deployments: z.array(
          z
            .object({
              id: z.string(),
              created_on: z.string(),
              source: z.string(),
              versions: z.array(z.object({ percentage: z.number(), version_id: z.string() })),
            })
            .transform((deployment) => ({
              id: deployment.id,
              createdOn: deployment.created_on,
              source: deployment.source,
              versions: deployment.versions.map((version) => ({
                percentage: version.percentage,
                versionId: version.version_id,
              })),
            })),
        ),
      })
      .transform((result) => result.deployments);
    return this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/deployments`,
      schema,
    );
  }

  async deleteDeployment(scriptName: string, deploymentId: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/deployments/${encodeURIComponent(deploymentId)}`,
      z.unknown(),
      { method: 'DELETE' },
    );
  }

  async deployVersion(scriptName: string, versionId: string, message: string): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/deployments`,
      z.unknown(),
      {
        method: 'POST',
        body: JSON.stringify({
          strategy: 'percentage',
          versions: [{ version_id: versionId, percentage: 100 }],
          annotations: {
            'workers/message': message.slice(0, 1000),
            'workers/triggered_by': 'workerdeck',
          },
        }),
      },
    );
  }

  async setVersionTraffic(
    scriptName: string,
    versions: Array<{ versionId: string; percentage: number }>,
    message: string,
  ): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/deployments`,
      z.unknown(),
      {
        method: 'POST',
        body: JSON.stringify({
          strategy: 'percentage',
          versions: versions.map((version) => ({
            version_id: version.versionId,
            percentage: version.percentage,
          })),
          annotations: {
            'workers/message': message.slice(0, 1000),
            'workers/triggered_by': 'workerdeck',
          },
        }),
      },
    );
  }

  async listCronTriggers(
    scriptName: string,
  ): Promise<Array<{ cron: string; createdOn: string; modifiedOn: string }>> {
    const accountId = this.#requireAccountId();
    const schema = z
      .object({
        schedules: z.array(
          z
            .object({
              cron: z.string(),
              created_on: z.string(),
              modified_on: z.string(),
            })
            .transform((schedule) => ({
              cron: schedule.cron,
              createdOn: schedule.created_on,
              modifiedOn: schedule.modified_on,
            })),
        ),
      })
      .transform((result) => result.schedules);
    return this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/schedules`,
      schema,
    );
  }

  async setCronTriggers(scriptName: string, crons: string[]): Promise<void> {
    const accountId = this.#requireAccountId();
    await this.#request(
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/schedules`,
      z.unknown(),
      {
        method: 'PUT',
        body: JSON.stringify(crons.map((cron) => ({ cron }))),
      },
    );
  }

  async #request<T>(path: string, resultSchema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.#token}`);
    headers.set('User-Agent', 'WorkerDeck/0.0.0');
    if (!(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await this.#fetcher(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
    });

    const payload: unknown = await response.json().catch(() => null);
    const parsed = envelopeSchema.safeParse(payload);

    if (!response.ok || !parsed.success || !parsed.data.success) {
      const errors = parsed.success ? parsed.data.errors : [];
      const detail = errors.map((error) => error.message).join('; ');
      throw new CloudflareApiError(
        detail || `Cloudflare API request failed with status ${response.status}.`,
        response.status,
        errors,
      );
    }

    const result = resultSchema.safeParse(parsed.data.result);
    if (!result.success) {
      throw new CloudflareApiError('Cloudflare returned an invalid API response.', response.status);
    }
    return result.data;
  }

  async #graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    dataSchema: z.ZodType<T>,
  ): Promise<T> {
    const response = await this.#fetcher(`${this.#baseUrl}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'WorkerDeck/0.0.0',
      },
      body: JSON.stringify({ query, variables }),
    });
    const payload: unknown = await response.json().catch(() => null);
    const envelope = z
      .object({
        data: z.unknown().nullish(),
        errors: z
          .array(z.object({ message: z.string().optional().default('GraphQL query failed') }))
          .nullish(),
      })
      .safeParse(payload);
    if (!response.ok || !envelope.success || envelope.data.errors?.length || !envelope.data.data) {
      const detail = envelope.success
        ? envelope.data.errors?.map((error) => error.message).join('; ')
        : '';
      throw new CloudflareApiError(
        detail || `Cloudflare Analytics request failed with status ${response.status}.`,
        response.status,
      );
    }
    const parsed = dataSchema.safeParse(envelope.data.data);
    if (!parsed.success) {
      throw new CloudflareApiError(
        'Cloudflare returned an invalid Analytics response.',
        response.status,
      );
    }
    return parsed.data;
  }

  #requireAccountId(): string {
    if (!this.#accountId) {
      throw new Error('A Cloudflare account ID is required for this operation.');
    }
    return this.#accountId;
  }
}

const workerDomainSchema = z
  .object({
    id: z.string(),
    hostname: z.string(),
    service: z.string(),
    zone_id: z.string(),
    zone_name: z.string(),
    cert_id: z.string().nullish(),
  })
  .transform((domain): WorkerDomain => ({
    id: domain.id,
    hostname: domain.hostname,
    service: domain.service,
    zoneId: domain.zone_id,
    zoneName: domain.zone_name,
    certificateId: domain.cert_id ?? null,
  }));

const emailRoutingAddressSchema = z
  .object({
    id: z.string().nullish(),
    tag: z.string().nullish(),
    email: z.string(),
    verified: z.string().nullish(),
    created: z.string().nullish(),
    modified: z.string().nullish(),
  })
  .transform((address): CloudflareEmailRoutingAddress => ({
    id: address.id ?? address.tag ?? address.email,
    email: address.email,
    verified: address.verified !== null,
    createdAt: address.created ?? null,
  }));

const emailRoutingActionSchema = z.object({
  type: z.string(),
  value: z.array(z.string()).nullish(),
});

const emailRoutingMatcherSchema = z.object({
  type: z.string(),
  field: z.string().nullish(),
  value: z.string().nullish(),
});

const emailRoutingRuleSchema = z
  .object({
    id: z.string().nullish(),
    tag: z.string().nullish(),
    enabled: z.boolean(),
    actions: z.array(emailRoutingActionSchema).nullish(),
    matchers: z.array(emailRoutingMatcherSchema).nullish(),
    name: z.string().nullish(),
  })
  .transform((rule): CloudflareEmailRoutingRule => {
    const matcherEmail =
      (rule.matchers ?? []).find((matcher) => matcher.field === 'to')?.value ?? '';
    const destinationEmail =
      (rule.actions ?? []).find((action) => action.type === 'forward')?.value?.[0] ?? '';
    return {
      id: rule.id ?? rule.tag ?? matcherEmail,
      matcherEmail,
      destinationEmail,
      enabled: rule.enabled,
      name: rule.name ?? null,
    };
  });

const emailRoutingSettingsSchema = z
  .object({
    enabled: z.boolean(),
    status: z.string().nullish(),
    name: z.string().nullish(),
  })
  .transform((settings): CloudflareEmailRoutingStatus => ({
    enabled: settings.enabled,
    status: settings.status ?? (settings.enabled ? 'ready' : 'disabled'),
    domain: settings.name ?? null,
  }));

const emailRoutingCatchAllSchema = z
  .object({
    enabled: z.boolean(),
    actions: z.array(emailRoutingActionSchema).nullish(),
  })
  .transform((rule): CloudflareEmailRoutingCatchAll => ({
    enabled: rule.enabled,
    destinationEmail:
      (rule.actions ?? []).find((action) => action.type === 'forward')?.value?.[0] ?? null,
  }));
