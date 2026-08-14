import {
  apiErrorSchema,
  buildLogsSchema,
  cacheRevalidationHintSchema,
  dashboardSummarySchema,
  deploymentSchema,
  environmentVariableSchema,
  environmentVariablesSchema,
  gitHubConnectionSchema,
  gitInstallationSchema,
  gitRepositorySchema,
  repositoryInspectionSchema,
  domainSchema,
  managedResourceSchema,
  projectCacheSchema,
  recoveryPostureSchema,
  usageSummarySchema,
  webAnalyticsSchema,
  workerAnalyticsSchema,
  projectSchema,
  type ApiSuccess,
  type BuildLogs,
  type CacheRevalidationHint,
  type CreateProjectInput,
  type DashboardSummary,
  type Deployment,
  type EnvironmentVariable,
  type EnvironmentVariables,
  type EnvironmentVariableTarget,
  type GitHubConnection,
  type GitInstallation,
  type GitRepository,
  type RepositoryInspection,
  type WorkerDomain,
  type CreateResourceInput,
  type ManagedResource,
  type Project,
  type ProjectCache,
  type RecoveryPosture,
  type UsageSummary,
  type WebAnalytics,
  type WorkerAnalytics,
} from '@workerdeck/contracts';
import { z } from 'zod';
import { demoSummary } from './fixtures';

export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string;

  constructor(code: string, message: string, requestId: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = requestId;
  }
}

async function request<T>(
  path: string,
  init: RequestInit,
  parse: (value: unknown) => T,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiError(
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.requestId,
      );
    }
    throw new ApiError(
      'INVALID_RESPONSE',
      'WorkerDeck returned an invalid response.',
      response.headers.get('X-Request-Id') ?? 'unknown',
    );
  }

  return parse(payload);
}

export function isDemoMode(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === '1';
}

export async function getDashboard(): Promise<DashboardSummary> {
  if (isDemoMode()) return Promise.resolve(demoSummary);
  return request('/api/v1/dashboard', { method: 'GET' }, (value) => {
    const envelope = value as ApiSuccess<unknown>;
    return dashboardSummarySchema.parse(envelope.data);
  });
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (isDemoMode()) {
    const now = new Date().toISOString();
    const repositoryParts = new URL(input.repositoryUrl).pathname.split('/').filter(Boolean);
    return Promise.resolve({
      id: crypto.randomUUID(),
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      repositoryUrl: input.repositoryUrl,
      repositoryOwner: repositoryParts[0] ?? null,
      repositoryName: repositoryParts[1]?.replace(/\.git$/, '') ?? null,
      productionBranch: input.productionBranch,
      framework: input.framework,
      outputDirectory: input.outputDirectory,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }
  return request(
    '/api/v1/projects',
    {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return projectSchema.parse(envelope.data);
    },
  );
}

export async function createDeployment(
  projectId: string,
  environmentId: string,
): Promise<Deployment> {
  if (isDemoMode()) {
    return Promise.resolve({
      id: crypto.randomUUID(),
      projectId,
      environmentId,
      status: 'building',
      gitCommitSha: null,
      gitCommitMessage: 'Manual production deployment',
      gitBranch: 'main',
      buildId: crypto.randomUUID(),
      workerVersionId: null,
      previewUrl: null,
      triggeredBy: 'demo@workerdeck.local',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
    });
  }
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/deployments`,
    {
      method: 'POST',
      body: JSON.stringify({ environmentId }),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return deploymentSchema.parse(envelope.data);
    },
  );
}

export async function deleteDeployment(deploymentId: string): Promise<void> {
  if (isDemoMode()) return Promise.resolve();
  await request(
    `/api/v1/deployments/${encodeURIComponent(deploymentId)}`,
    { method: 'DELETE' },
    () => undefined,
  );
}

export async function deleteProject(projectId: string, confirmation: string): Promise<void> {
  if (isDemoMode()) return Promise.resolve();
  await request(
    `/api/v1/projects/${encodeURIComponent(projectId)}`,
    { method: 'DELETE', body: JSON.stringify({ confirmation }) },
    () => undefined,
  );
}

export async function syncDeployment(deploymentId: string): Promise<Deployment> {
  if (isDemoMode()) {
    throw new ApiError('DEMO_BUILD', 'Demo builds are not reconciled with Cloudflare.', 'demo');
  }
  return request(
    `/api/v1/deployments/${encodeURIComponent(deploymentId)}/sync`,
    { method: 'POST' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return deploymentSchema.parse(envelope.data);
    },
  );
}

export async function createResource(input: CreateResourceInput): Promise<ManagedResource> {
  if (isDemoMode()) {
    return Promise.resolve({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      environmentId: input.environmentId,
      kind: input.kind,
      cloudflareId: input.kind === 'durable_object' ? input.cloudflareId : crypto.randomUUID(),
      name: input.name,
      ownershipTag: `workerdeck:${input.projectId}:${input.environmentId}:${input.kind}:demo`,
      status: input.kind === 'durable_object' ? 'adopted' : 'active',
      createdAt: new Date().toISOString(),
      deletedAt: null,
    });
  }
  return request(
    '/api/v1/resources',
    {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return managedResourceSchema.parse(envelope.data);
    },
  );
}

export async function getManagedResources(): Promise<ManagedResource[]> {
  if (isDemoMode()) {
    return Promise.resolve([
      {
        id: '4f408826-01fa-41e6-9027-f63565dd9224',
        projectId: demoSummary.projects[0]?.id ?? null,
        environmentId: demoSummary.environments[0]?.id ?? null,
        kind: 'd1',
        cloudflareId: 'database-demo',
        name: 'checkout-db',
        ownershipTag: 'workerdeck:demo:d1',
        status: 'active',
        createdAt: new Date().toISOString(),
        deletedAt: null,
      },
      {
        id: '49c5952d-0a31-401d-9132-af617b7a99de',
        projectId: demoSummary.projects[0]?.id ?? null,
        environmentId: demoSummary.environments[0]?.id ?? null,
        kind: 'kv',
        cloudflareId: 'kv-demo',
        name: 'session-cache',
        ownershipTag: 'workerdeck:demo:kv',
        status: 'active',
        createdAt: new Date().toISOString(),
        deletedAt: null,
      },
    ]);
  }
  return request('/api/v1/resources', { method: 'GET' }, (value) => {
    const envelope = value as ApiSuccess<unknown>;
    return managedResourceSchema.array().parse(envelope.data);
  });
}

export async function getDurableObjectNamespaces(): Promise<
  Array<{ id: string; name: string; className: string; scriptName: string }>
> {
  if (isDemoMode()) {
    return Promise.resolve([
      {
        id: 'namespace-demo-1',
        name: 'checkout-sessions',
        className: 'CheckoutSession',
        scriptName: 'workerdeck-checkout-api',
      },
      {
        id: 'namespace-demo-2',
        name: 'rate-limits',
        className: 'RateLimiter',
        scriptName: 'workerdeck-checkout-api',
      },
    ]);
  }
  return request('/api/v1/cloudflare/durable-objects/namespaces', { method: 'GET' }, (value) => {
    const envelope = value as ApiSuccess<unknown>;
    return z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          className: z.string(),
          scriptName: z.string(),
        }),
      )
      .parse(envelope.data);
  });
}

export async function getWorkerAnalytics(
  hours = 24,
  workerName?: string,
): Promise<WorkerAnalytics> {
  if (isDemoMode()) return Promise.resolve(demoAnalytics(hours));
  const workerQuery = workerName ? `&worker=${encodeURIComponent(workerName)}` : '';
  return request(
    `/api/v1/operations/analytics?hours=${hours}${workerQuery}`,
    { method: 'GET' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return workerAnalyticsSchema.parse(envelope.data);
    },
  );
}

export async function getWebAnalytics(
  projectId: string,
  environmentId: string,
  hours = 24,
): Promise<WebAnalytics> {
  if (isDemoMode()) return Promise.resolve(demoWebAnalytics(hours));
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/analytics/web?hours=${hours}`,
    { method: 'GET' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return webAnalyticsSchema.parse(envelope.data);
    },
  );
}

export async function getRecoveryPosture(): Promise<RecoveryPosture> {
  if (isDemoMode()) {
    const verifiedAt = new Date().toISOString();
    return Promise.resolve({
      destructiveRestore: true,
      cloneRestoreAvailable: false,
      retention: '7 days on Free; 30 days on Paid',
      resources: [
        {
          resourceId: '4f408826-01fa-41e6-9027-f63565dd9224',
          databaseId: 'database-demo',
          name: 'checkout-db',
          status: 'verified',
          currentBookmark: '00000085-demo-current',
          recoveryBookmark: '00000085-demo-recovery',
          recoveryTimestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          verifiedAt,
          reason: null,
        },
      ],
    });
  }
  return request('/api/v1/operations/recovery', { method: 'GET' }, (value) => {
    const envelope = value as ApiSuccess<unknown>;
    return recoveryPostureSchema.parse(envelope.data);
  });
}

export async function getUsageSummary(hours = 24): Promise<UsageSummary> {
  if (isDemoMode()) {
    return Promise.resolve({
      analytics: demoAnalytics(hours),
      builds: { limitReached: false, refreshesAt: new Date('2026-09-01T00:00:00Z').toISOString() },
    });
  }
  return request(`/api/v1/operations/usage?hours=${hours}`, { method: 'GET' }, (value) => {
    const envelope = value as ApiSuccess<unknown>;
    return usageSummarySchema.parse(envelope.data);
  });
}

export async function getProjectDomains(
  projectId: string,
  environmentId: string,
): Promise<WorkerDomain[]> {
  if (isDemoMode()) {
    return Promise.resolve([
      {
        id: 'domain-demo',
        hostname: 'northstar.example.com',
        service: 'workerdeck-northstar-web',
        zoneId: 'zone-demo',
        zoneName: 'example.com',
        certificateId: 'certificate-demo',
      },
    ]);
  }
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/domains`,
    { method: 'GET' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return domainSchema.array().parse(envelope.data);
    },
  );
}

export async function attachProjectDomain(
  projectId: string,
  environmentId: string,
  hostname: string,
): Promise<WorkerDomain> {
  if (isDemoMode()) {
    return Promise.resolve({
      id: crypto.randomUUID(),
      hostname,
      service: 'workerdeck-demo',
      zoneId: 'zone-demo',
      zoneName: hostname.split('.').slice(-2).join('.'),
      certificateId: null,
    });
  }
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/domains`,
    {
      method: 'POST',
      body: JSON.stringify({ hostname }),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return domainSchema.parse(envelope.data);
    },
  );
}

export async function detachProjectDomain(
  projectId: string,
  environmentId: string,
  domainId: string,
): Promise<void> {
  if (isDemoMode()) return;
  await request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/domains/${encodeURIComponent(domainId)}`,
    { method: 'DELETE' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return envelope.data;
    },
  );
}

const trafficDeploymentSchema = z
  .object({
    id: z.string(),
    versions: z.array(z.object({ percentage: z.number(), versionId: z.string() })),
  })
  .nullable();

export async function getProjectTraffic(
  projectId: string,
  environmentId: string,
): Promise<{ id: string; versions: Array<{ percentage: number; versionId: string }> } | null> {
  if (isDemoMode()) return null;
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/traffic`,
    { method: 'GET' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return trafficDeploymentSchema.parse(envelope.data);
    },
  );
}

export async function setProjectTraffic(
  projectId: string,
  environmentId: string,
  versions: Array<{ versionId: string; percentage: number }>,
): Promise<void> {
  if (isDemoMode()) return;
  await request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/traffic`,
    { method: 'POST', body: JSON.stringify({ versions }) },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return envelope.data;
    },
  );
}

export async function setSystemDomainEnabled(
  projectId: string,
  environmentId: string,
  enabled: boolean,
): Promise<void> {
  if (isDemoMode()) return;
  await request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/subdomain`,
    { method: 'PUT', body: JSON.stringify({ enabled }) },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return envelope.data;
    },
  );
}

export async function getCronSchedules(
  projectId: string,
  environmentId: string,
): Promise<Array<{ cron: string; createdOn: string; modifiedOn: string }>> {
  if (isDemoMode()) return [];
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/cron`,
    { method: 'GET' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return z
        .array(z.object({ cron: z.string(), createdOn: z.string(), modifiedOn: z.string() }))
        .parse(envelope.data);
    },
  );
}

export async function setCronSchedules(
  projectId: string,
  environmentId: string,
  schedules: string[],
): Promise<void> {
  if (isDemoMode()) return;
  await request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/cron`,
    { method: 'PUT', body: JSON.stringify({ schedules }) },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return envelope.data;
    },
  );
}

export type CacheRuleInput = {
  id?: string;
  pathExpression: string;
  edgeTtlSeconds: number;
  browserTtlSeconds: number | null;
  enabled: boolean;
};

export async function getProjectCache(
  projectId: string,
  environmentId: string,
): Promise<ProjectCache> {
  if (isDemoMode()) return Promise.resolve(demoProjectCache());
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/cache`,
    { method: 'GET' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return projectCacheSchema.parse(envelope.data);
    },
  );
}

export async function setProjectCacheRules(
  projectId: string,
  environmentId: string,
  rules: CacheRuleInput[],
): Promise<ProjectCache> {
  if (isDemoMode()) {
    const state = demoProjectCache();
    const syncedAt = new Date().toISOString();
    demoCacheState = {
      ...state,
      rules: rules.map((rule) => ({
        id: rule.id ?? crypto.randomUUID(),
        pathExpression: rule.pathExpression,
        edgeTtlSeconds: rule.edgeTtlSeconds,
        browserTtlSeconds: rule.browserTtlSeconds,
        enabled: rule.enabled,
        syncedAt,
        syncError: null,
      })),
    };
    return Promise.resolve(demoCacheState);
  }
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/cache/rules`,
    { method: 'PUT', body: JSON.stringify({ rules }) },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return projectCacheSchema.parse(envelope.data);
    },
  );
}

export async function setProjectCacheSettings(
  projectId: string,
  environmentId: string,
  revalidationNamespaceResourceId: string | null,
): Promise<ProjectCache> {
  if (isDemoMode()) {
    const state = demoProjectCache();
    const selected = state.revalidation.availableNamespaces.find(
      (namespace) => namespace.resourceId === revalidationNamespaceResourceId,
    );
    demoCacheState = {
      ...state,
      revalidation: {
        ...state.revalidation,
        namespaceResourceId: selected?.resourceId ?? null,
        namespaceName: selected?.name ?? null,
      },
    };
    return Promise.resolve(demoCacheState);
  }
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/cache/settings`,
    { method: 'PUT', body: JSON.stringify({ revalidationNamespaceResourceId }) },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return projectCacheSchema.parse(envelope.data);
    },
  );
}

export async function purgeProjectCache(
  projectId: string,
  environmentId: string,
): Promise<Array<{ zoneId: string; zoneName: string }>> {
  if (isDemoMode()) {
    return Promise.resolve(
      demoProjectCache().zones.map((zone) => ({ zoneId: zone.zoneId, zoneName: zone.zoneName })),
    );
  }
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/cache/purge`,
    { method: 'POST', body: JSON.stringify({ scope: 'all' }) },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return z
        .object({ purgedZones: z.array(z.object({ zoneId: z.string(), zoneName: z.string() })) })
        .parse(envelope.data).purgedZones;
    },
  );
}

export async function revalidateProjectCache(
  projectId: string,
  environmentId: string,
  paths: string[],
): Promise<CacheRevalidationHint[]> {
  if (isDemoMode()) {
    const state = demoProjectCache();
    const now = new Date().toISOString();
    const next = state.revalidation.hints.map((hint) =>
      paths.includes(hint.pathExpression) ? { ...hint, revalidatedAt: now } : hint,
    );
    demoCacheState = {
      ...state,
      revalidation: { ...state.revalidation, hints: next },
    };
    return Promise.resolve(next.filter((hint) => paths.includes(hint.pathExpression)));
  }
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/cache/revalidate`,
    { method: 'POST', body: JSON.stringify({ paths }) },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return z.object({ hints: z.array(cacheRevalidationHintSchema) }).parse(envelope.data).hints;
    },
  );
}

export async function rollbackDeployment(deploymentId: string): Promise<Deployment> {
  if (isDemoMode()) {
    const target = demoSummary.deployments.find((deployment) => deployment.id === deploymentId);
    if (!target)
      throw new ApiError('DEPLOYMENT_NOT_FOUND', 'The deployment does not exist.', 'demo');
    return Promise.resolve({
      ...target,
      id: crypto.randomUUID(),
      status: 'rolled_back',
      gitCommitMessage: `Rollback to ${target.gitCommitMessage ?? target.workerVersionId ?? 'version'}`,
      triggeredBy: 'demo@workerdeck.local',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }
  return request(
    `/api/v1/deployments/${encodeURIComponent(deploymentId)}/rollback`,
    {
      method: 'POST',
      body: JSON.stringify({ targetDeploymentId: deploymentId, confirmation: 'ROLLBACK' }),
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return deploymentSchema.parse(envelope.data);
    },
  );
}

export async function getEnvironmentVariables(
  projectId: string,
  environmentId: string,
): Promise<EnvironmentVariables> {
  if (isDemoMode()) {
    return Promise.resolve({
      environmentId,
      workerName: 'workerdeck-checkout-api',
      buildConnected: true,
      runtimeConnected: true,
      variables: [
        {
          key: 'NODE_ENV',
          target: 'build',
          secret: false,
          value: 'production',
          createdAt: new Date().toISOString(),
        },
        {
          key: 'SENTRY_AUTH_TOKEN',
          target: 'build',
          secret: true,
          value: null,
          createdAt: new Date().toISOString(),
        },
        {
          key: 'PAYMENT_API_KEY',
          target: 'runtime_secret',
          secret: true,
          value: null,
          createdAt: null,
        },
      ],
    });
  }
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/variables`,
    { method: 'GET' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return environmentVariablesSchema.parse(envelope.data);
    },
  );
}

export async function upsertEnvironmentVariable(
  projectId: string,
  environmentId: string,
  key: string,
  input: { target: EnvironmentVariableTarget; secret: boolean; value: string },
): Promise<EnvironmentVariable> {
  if (isDemoMode()) {
    return Promise.resolve({
      key,
      target: input.target,
      secret: input.secret,
      value: input.secret ? null : input.value,
      createdAt: new Date().toISOString(),
    });
  }
  return request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/variables/${encodeURIComponent(key)}`,
    { method: 'PUT', body: JSON.stringify(input) },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return environmentVariableSchema.parse(envelope.data);
    },
  );
}

export async function deleteEnvironmentVariable(
  projectId: string,
  environmentId: string,
  key: string,
  target: EnvironmentVariableTarget,
): Promise<void> {
  if (isDemoMode()) return Promise.resolve();
  await request(
    `/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/variables/${encodeURIComponent(key)}?target=${encodeURIComponent(target)}`,
    { method: 'DELETE' },
    () => undefined,
  );
}

export async function getGitHubConnection(): Promise<GitHubConnection> {
  if (isDemoMode()) {
    return Promise.resolve({
      configured: true,
      appSlug: 'workerdeck-demo',
      installUrl: 'https://github.com/apps/workerdeck-demo/installations/new',
      installations: [{ id: '123456', accountLogin: 'acme', accountType: 'Organization' }],
    });
  }
  return request('/api/v1/git/github/connection', { method: 'GET' }, (value) => {
    const envelope = value as ApiSuccess<unknown>;
    return gitHubConnectionSchema.parse(envelope.data);
  });
}

export async function registerGitHubInstallation(
  installationId: string,
  state: string,
): Promise<GitInstallation> {
  return request(
    '/api/v1/git/github/installations',
    { method: 'POST', body: JSON.stringify({ installationId, state }) },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return gitInstallationSchema.parse(envelope.data);
    },
  );
}

export async function syncGitHubInstallations(): Promise<GitInstallation[]> {
  if (isDemoMode()) {
    return Promise.resolve([{ id: '123456', accountLogin: 'acme', accountType: 'Organization' }]);
  }
  return request(
    '/api/v1/git/github/installations/sync',
    { method: 'POST', body: '{}' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return gitInstallationSchema.array().parse(envelope.data);
    },
  );
}

export async function startGitHubSetup(): Promise<string> {
  if (isDemoMode()) {
    return Promise.resolve(
      'https://github.com/apps/workerdeck-demo/installations/new?state=demo-installation',
    );
  }
  return request('/api/v1/git/github/setup', { method: 'POST', body: '{}' }, (value) => {
    const envelope = value as ApiSuccess<{ installUrl: string }>;
    return new URL(envelope.data.installUrl).toString();
  });
}

export async function getGitHubRepositories(): Promise<GitRepository[]> {
  if (isDemoMode()) {
    return Promise.resolve([
      {
        id: '1001',
        ownerId: '101',
        owner: 'acme',
        name: 'checkout-api',
        fullName: 'acme/checkout-api',
        private: true,
        url: 'https://github.com/acme/checkout-api',
        defaultBranch: 'main',
        language: 'TypeScript',
        pushedAt: new Date().toISOString(),
      },
      {
        id: '1002',
        ownerId: '101',
        owner: 'acme',
        name: 'marketing-site',
        fullName: 'acme/marketing-site',
        private: false,
        url: 'https://github.com/acme/marketing-site',
        defaultBranch: 'main',
        language: 'TypeScript',
        pushedAt: new Date().toISOString(),
      },
    ]);
  }
  return request('/api/v1/git/github/repositories', { method: 'GET' }, (value) => {
    const envelope = value as ApiSuccess<unknown>;
    return gitRepositorySchema.array().parse(envelope.data);
  });
}

export async function inspectGitHubRepository(repositoryId: string): Promise<RepositoryInspection> {
  if (isDemoMode()) {
    return Promise.resolve({
      repositoryId,
      framework: 'hono',
      displayName: 'Hono',
      confidence: 'high',
      evidence: ['Found the `hono` package.', 'Found a Wrangler configuration.'],
      rootDirectory: '/',
      buildCommand: 'npm run build',
      deployCommand: 'npx wrangler deploy',
      outputDirectory: null,
      runtime: 'worker',
      packageManager: 'npm',
      ready: true,
      warnings: [],
    });
  }
  return request(
    `/api/v1/git/github/repositories/${encodeURIComponent(repositoryId)}/inspection`,
    { method: 'GET' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return repositoryInspectionSchema.parse(envelope.data);
    },
  );
}

export async function getBuildLogs(deploymentId: string): Promise<BuildLogs> {
  if (isDemoMode()) {
    return Promise.resolve({
      buildId: 'build_demo',
      cursor: null,
      truncated: false,
      lines: [
        { timestamp: Date.now() - 42_000, message: 'Cloning repository (main)' },
        { timestamp: Date.now() - 37_000, message: 'Installing dependencies with npm' },
        { timestamp: Date.now() - 24_000, message: 'Running npm run build' },
        { timestamp: Date.now() - 9_000, message: 'Uploading Worker version' },
        { timestamp: Date.now() - 3_000, message: 'Deployment ready on the global network' },
      ],
    });
  }
  return request(
    `/api/v1/deployments/${encodeURIComponent(deploymentId)}/logs`,
    { method: 'GET' },
    (value) => {
      const envelope = value as ApiSuccess<unknown>;
      return buildLogsSchema.parse(envelope.data);
    },
  );
}

function demoAnalytics(hours: number): WorkerAnalytics {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  const workerNames = [
    'workerdeck-northstar-web',
    'workerdeck-relay-api',
    'workerdeck-field-notes',
  ];
  const projects = workerNames.map((workerName, index) => ({
    workerName,
    requests: [42_810, 13_207, 6_391][index] ?? 0,
    errors: [31, 0, 19][index] ?? 0,
    subrequests: [11_902, 2_134, 4_109][index] ?? 0,
    errorRate: ([31, 0, 19][index] ?? 0) / ([42_810, 13_207, 6_391][index] ?? 1),
    cpuTimeP50: [4.1, 1.8, 5.2][index] ?? null,
    cpuTimeP99: [38, 18, 44][index] ?? null,
    points: Array.from({ length: 12 }, (_, pointIndex) => ({
      timestamp: new Date(
        from.getTime() + pointIndex * (hours / 12) * 60 * 60 * 1000,
      ).toISOString(),
      requests: 1_800 + ((pointIndex * 733 + index * 419) % 2_100),
      errors: pointIndex === 8 && index === 0 ? 9 : (pointIndex + index) % 3,
      subrequests: 420 + ((pointIndex * 191 + index * 83) % 700),
      cpuTimeP99: 18 + ((pointIndex * 7 + index * 11) % 35),
    })),
  }));
  const requests = projects.reduce((total, project) => total + project.requests, 0);
  const errors = projects.reduce((total, project) => total + project.errors, 0);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    sampled: true,
    requests,
    errors,
    subrequests: projects.reduce((total, project) => total + project.subrequests, 0),
    errorRate: errors / requests,
    cpuTimeP50: 4.1,
    cpuTimeP99: 44,
    projects,
    points: projects[0]?.points ?? [],
  };
}

function demoWebAnalytics(hours: number): WebAnalytics {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    sampled: true,
    hostnames: ['northstar.example.com', 'workerdeck-northstar-web.example-subdomain.workers.dev'],
    visits: 12_408,
    pageViews: 21_906,
    vitals: {
      lcpP75: 1_640,
      inpP75: 218,
      clsP75: 0.08,
      fcpP75: 1_180,
      ttfbP75: 312,
    },
    topPaths: [
      { path: '/', pageViews: 9_204, visits: 4_311 },
      { path: '/pricing', pageViews: 3_807, visits: 2_106 },
      { path: '/docs/getting-started', pageViews: 2_418, visits: 1_392 },
      { path: '/blog/launch-week', pageViews: 1_654, visits: 1_001 },
      { path: '/changelog', pageViews: 1_119, visits: 612 },
    ],
  };
}

let demoCacheState: ProjectCache | null = null;

function demoProjectCache(): ProjectCache {
  if (!demoCacheState) {
    const syncedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const revalidatedAt = new Date(Date.now() - 12 * 60 * 1000).toISOString();
    demoCacheState = {
      rules: [
        {
          id: '1b7a6f42-2d21-4b2d-9d7c-8a1f2c3d4e51',
          pathExpression: '/blog/*',
          edgeTtlSeconds: 3600,
          browserTtlSeconds: 600,
          enabled: true,
          syncedAt,
          syncError: null,
        },
        {
          id: '2c8b7f53-3e32-4c3e-ae8d-9b2f3d4e5f62',
          pathExpression: '/api/*',
          edgeTtlSeconds: 0,
          browserTtlSeconds: null,
          enabled: true,
          syncedAt,
          syncError: null,
        },
        {
          id: '3d9c8f64-4f43-4d4f-bf9e-0c3f4e5f6073',
          pathExpression: '/assets/*',
          edgeTtlSeconds: 2_592_000,
          browserTtlSeconds: 86_400,
          enabled: false,
          syncedAt,
          syncError: null,
        },
      ],
      zones: [
        {
          zoneId: 'zone-northstar',
          zoneName: 'northstar.example.com',
          hostnames: ['northstar.example.com', 'www.northstar.example.com'],
        },
      ],
      revalidation: {
        namespaceResourceId: '49c5952d-0a31-401d-9132-af617b7a99de',
        namespaceName: 'session-cache',
        availableNamespaces: [
          { resourceId: '49c5952d-0a31-401d-9132-af617b7a99de', name: 'session-cache' },
        ],
        hints: [
          { pathExpression: '/blog/*', revalidatedAt },
          { pathExpression: '/api/*', revalidatedAt: null },
          { pathExpression: '/assets/*', revalidatedAt: null },
        ],
      },
    };
  }
  return demoCacheState;
}
