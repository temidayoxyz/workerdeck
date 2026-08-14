import {
  apiErrorSchema,
  buildLogsSchema,
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
  recoveryPostureSchema,
  usageSummarySchema,
  workerAnalyticsSchema,
  projectSchema,
  type ApiSuccess,
  type BuildLogs,
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
  type RecoveryPosture,
  type UsageSummary,
  type WorkerAnalytics,
} from '@workerdeck/contracts';
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
      cloudflareId: crypto.randomUUID(),
      name: input.name,
      ownershipTag: `workerdeck:${input.projectId}:${input.environmentId}:${input.kind}:demo`,
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
