import {
  cacheSettingsInputSchema,
  attachDomainInputSchema,
  createDeploymentInputSchema,
  createProjectInputSchema,
  createResourceInputSchema,
  environmentVariableKeySchema,
  purgeCacheInputSchema,
  revalidateCacheInputSchema,
  rollbackDeploymentInputSchema,
  setCronSchedulesInputSchema,
  setCacheRulesInputSchema,
  setTrafficInputSchema,
  repositoryInspectionSchema,
  upsertEnvironmentVariableInputSchema,
  type CacheRevalidationHint,
  type CacheRule,
  type CreateResourceInput,
  type DashboardSummary,
  type ProjectCache,
  type RecoveryResource,
  type ResourceKind,
  type WorkerAnalytics,
  type WebAnalytics,
} from '@workerdeck/contracts';
import {
  CloudflareApiError,
  CloudflareClient,
  type ProvisionedResource,
} from '@workerdeck/provider';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { authenticate } from './auth';
import {
  managedBuildCommand,
  managedDeployCommand,
  workerNameBuildVariable,
} from './build-commands';
import { diagnoseBuildFailure } from './build-diagnostics';
import { AppError } from './errors';
import {
  cacheRulesetRulesFor,
  distinctCacheZones,
  mergeZoneCacheRules,
  parseRevalidationTimestamp,
  revalidationGenerationKey,
  revalidationKeyFor,
} from './cache';
import { GitHubAppClient } from './github';
import { Repository, type DeploymentTarget } from './repository';
import { requestContext, securityHeaders, verifyMutationOrigin } from './security';
import type { AppEnv } from './types';
import { aggregateWebAnalytics } from './web-analytics';

const app = new Hono<AppEnv>();
const buildRepairRevision = 'nonmutating-framework-builds-v3';

app.use('*', requestContext);
app.use('*', securityHeaders);

app.get('/api/health', (context) =>
  context.json({ status: 'ok', service: 'workerdeck-control-plane', version: '0.0.0' }),
);

app.use('/api/v1/*', authenticate);
app.use('/api/v1/*', verifyMutationOrigin);
app.use(
  '/api/v1/*',
  bodyLimit({
    maxSize: 32 * 1024,
    onError: () => {
      throw new AppError(413, 'REQUEST_TOO_LARGE', 'WorkerDeck API requests are limited to 32 KB.');
    },
  }),
);

app.get('/api/v1/dashboard', async (context) => {
  const repository = new Repository(context.env.DB);
  const summary = await repository.dashboard({
    id: context.env.CLOUDFLARE_ACCOUNT_ID ?? null,
    name: context.env.CLOUDFLARE_ACCOUNT_NAME,
    userEmail: actorEmail(context.get('actor')),
    plan: 'unknown',
    connected: Boolean(context.env.CLOUDFLARE_API_TOKEN && context.env.CLOUDFLARE_ACCOUNT_ID),
  });
  return context.json({ data: summary, requestId: context.get('requestId') });
});

app.get('/api/v1/projects', async (context) => {
  const projects = await new Repository(context.env.DB).listProjects();
  return context.json({ data: projects, requestId: context.get('requestId') });
});

app.delete('/api/v1/projects/:projectId', async (context) => {
  const projectId = context.req.param('projectId');
  const repository = new Repository(context.env.DB);
  const plan = await repository.getProjectDeletionPlan(projectId);
  const body = (await context.req.json().catch(() => null)) as { confirmation?: unknown } | null;
  if (body?.confirmation !== plan.project.name) {
    throw new AppError(
      422,
      'PROJECT_CONFIRMATION_MISMATCH',
      `Enter ${plan.project.name} exactly to confirm deletion.`,
    );
  }
  if (
    plan.resources.some(
      (resource) =>
        ![
          'worker',
          'd1',
          'kv',
          'r2',
          'domain',
          'queue',
          'workflow',
          'hyperdrive',
          'vectorize',
          'ai_gateway',
          'durable_object',
        ].includes(resource.kind),
    )
  ) {
    throw new AppError(
      409,
      'PROJECT_RESOURCE_UNSUPPORTED',
      'This project owns a resource type that WorkerDeck cannot safely delete yet.',
    );
  }
  await repository.acquireProvisioningLock({
    scope: 'project-delete',
    key: projectId,
    actor: context.get('actor'),
    requestId: context.get('requestId'),
  });
  try {
    const client = cloudflareClient(context);
    const domains = plan.resources.filter((resource) => resource.kind === 'domain');
    const storage = plan.resources.filter((resource) =>
      ['d1', 'kv', 'r2', 'queue', 'workflow', 'hyperdrive', 'vectorize', 'ai_gateway'].includes(
        resource.kind,
      ),
    );
    const providerSteps: Array<{ label: string; run: () => Promise<void> }> = [
      ...domains.map((resource) => ({
        label: `domain:${resource.name}`,
        run: () => client.detachWorkerDomain(resource.cloudflareId),
      })),
      ...plan.buildTriggerIds.map((triggerId) => ({
        label: `build-trigger:${triggerId}`,
        run: () => client.deleteBuildTrigger(triggerId),
      })),
      ...(plan.workerName
        ? [{ label: `worker:${plan.workerName}`, run: () => client.deleteWorker(plan.workerName!) }]
        : []),
      ...storage.map((resource) => ({
        label: `${resource.kind}:${resource.name}`,
        run: () =>
          deleteProvisionedResource(client, resource.kind, {
            id: resource.cloudflareId,
            name: resource.name,
          }),
      })),
    ];
    const deleted: string[] = [];
    for (const step of providerSteps) {
      try {
        await ignoreCloudflareNotFound(step.run);
        deleted.push(step.label);
      } catch (error) {
        throw new AppError(
          502,
          'PROJECT_TEARDOWN_INCOMPLETE',
          `Cloudflare could not delete ${step.label}. The project record was preserved so teardown can be retried.`,
          { deleted, failed: step.label, cause: error instanceof Error ? error.name : 'unknown' },
        );
      }
    }
    await repository.deleteProjectRecord(
      projectId,
      context.get('actor'),
      context.get('requestId'),
      { deleted },
    );
    return context.json({ data: { deleted: true }, requestId: context.get('requestId') });
  } finally {
    await repository.releaseProvisioningLock('project-delete', projectId);
  }
});

app.get('/api/v1/resources', async (context) => {
  const resources = await new Repository(context.env.DB).listManagedResources();
  return context.json({ data: resources, requestId: context.get('requestId') });
});

app.get('/api/v1/operations/analytics', async (context) => {
  const summary = await dashboardSummary(context);
  const requestedWorker = context.req.query('worker');
  const ownedWorkerNames = new Set(
    summary.environments
      .map((environment) => environment.workerName)
      .filter((workerName): workerName is string => Boolean(workerName)),
  );
  if (requestedWorker && !ownedWorkerNames.has(requestedWorker)) {
    throw new AppError(404, 'WORKER_NOT_FOUND', 'That Worker is not managed by this workspace.');
  }
  const scopedSummary = requestedWorker
    ? {
        ...summary,
        environments: summary.environments.filter(
          (environment) => environment.workerName === requestedWorker,
        ),
      }
    : summary;
  const analytics = await workerAnalytics(context, scopedSummary, analyticsRange(context), true);
  return context.json({ data: analytics, requestId: context.get('requestId') });
});

app.get('/api/v1/operations/usage', async (context) => {
  const summary = await dashboardSummary(context);
  const client = cloudflareClient(context);
  const [analytics, builds] = await Promise.all([
    workerAnalytics(context, summary, analyticsRange(context), false),
    client.getBuildAccountLimits(),
  ]);
  return context.json({ data: { analytics, builds }, requestId: context.get('requestId') });
});

app.get('/api/v1/operations/recovery', async (context) => {
  const client = cloudflareClient(context);
  const resources = (await new Repository(context.env.DB).listManagedResources()).filter(
    (resource) => resource.kind === 'd1',
  );
  const verifiedAt = new Date().toISOString();
  const recoveryResources = await Promise.all(
    resources.map(async (resource): Promise<RecoveryResource> => {
      const recoveryTimestamp = new Date(
        Math.max(Date.now() - 5 * 60 * 1000, Date.parse(resource.createdAt)),
      ).toISOString();
      try {
        const [currentBookmark, recoveryBookmark] = await Promise.all([
          client.getD1Bookmark(resource.cloudflareId),
          client.getD1Bookmark(resource.cloudflareId, recoveryTimestamp),
        ]);
        return {
          resourceId: resource.id,
          databaseId: resource.cloudflareId,
          name: resource.name,
          status: 'verified',
          currentBookmark,
          recoveryBookmark,
          recoveryTimestamp,
          verifiedAt,
          reason: null,
        };
      } catch (error) {
        return {
          resourceId: resource.id,
          databaseId: resource.cloudflareId,
          name: resource.name,
          status: 'unavailable',
          currentBookmark: null,
          recoveryBookmark: null,
          recoveryTimestamp,
          verifiedAt,
          reason:
            error instanceof CloudflareApiError && error.status === 403
              ? 'permission_denied'
              : error instanceof CloudflareApiError && error.status === 400
                ? 'not_supported'
                : 'provider_unavailable',
        };
      }
    }),
  );
  return context.json({
    data: {
      destructiveRestore: true,
      cloneRestoreAvailable: false,
      retention: '7 days on Free; 30 days on Paid',
      resources: recoveryResources,
    },
    requestId: context.get('requestId'),
  });
});

app.get('/api/v1/projects/:projectId/environments/:environmentId/domains', async (context) => {
  const target = await new Repository(context.env.DB).getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  const domains = await cloudflareClient(context).listWorkerDomains(target.workerName);
  return context.json({ data: domains, requestId: context.get('requestId') });
});

app.post('/api/v1/projects/:projectId/environments/:environmentId/domains', async (context) => {
  const idempotencyKey = requireIdempotencyKey(context);
  const parsed = attachDomainInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(
      422,
      'INVALID_DOMAIN',
      'Enter a valid hostname in a Cloudflare zone owned by this account.',
      parsed.error.flatten(),
    );
  }
  const repository = new Repository(context.env.DB);
  const requestHash = await mutationRequestHash(
    `domain:${context.req.param('projectId')}:${context.req.param('environmentId')}`,
    parsed.data,
  );
  const replay = await repository.getIdempotentDomain(
    idempotencyKey,
    context.get('actor'),
    requestHash,
  );
  if (replay) {
    context.header('Idempotency-Replayed', 'true');
    return context.json({ data: replay, requestId: context.get('requestId') }, 201);
  }
  const target = await repository.getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  const client = cloudflareClient(context);
  const conflict = (await client.listWorkerDomains()).find(
    (domain) => domain.hostname.toLowerCase() === parsed.data.hostname,
  );
  if (conflict) {
    throw new AppError(
      409,
      'DOMAIN_ALREADY_ATTACHED',
      conflict.service === target.workerName
        ? 'This hostname is already attached to the project.'
        : 'This hostname is already attached to another Worker.',
    );
  }
  await repository.reserveIdempotencyKey(idempotencyKey, context.get('actor'), requestHash);
  let domain;
  try {
    domain = await client.attachWorkerDomain(parsed.data.hostname, target.workerName);
    await repository.recordManagedResource({
      projectId: target.projectId,
      environmentId: target.environmentId,
      kind: 'domain',
      cloudflareId: domain.id,
      name: domain.hostname,
      configuration: { certificateId: domain.certificateId },
      actor: context.get('actor'),
      requestId: context.get('requestId'),
    });
    await repository.storeIdempotentValue(
      idempotencyKey,
      context.get('actor'),
      requestHash,
      domain,
    );
  } catch (error) {
    if (domain) {
      try {
        await client.detachWorkerDomain(domain.id);
      } catch {
        console.error(
          JSON.stringify({
            level: 'error',
            requestId: context.get('requestId'),
            message: 'Domain compensation failed.',
            domainId: domain.id,
          }),
        );
      }
    }
    await repository.removeIdempotencyKey(idempotencyKey);
    throw error;
  }
  return context.json({ data: domain, requestId: context.get('requestId') }, 201);
});

app.delete(
  '/api/v1/projects/:projectId/environments/:environmentId/domains/:domainId',
  async (context) => {
    const repository = new Repository(context.env.DB);
    const target = await repository.getDeploymentTarget(
      context.req.param('projectId'),
      context.req.param('environmentId'),
    );
    const domainId = context.req.param('domainId');
    const domains = await cloudflareClient(context).listWorkerDomains(target.workerName);
    const domain = domains.find((candidate) => candidate.id === domainId);
    if (!domain) {
      throw new AppError(404, 'DOMAIN_NOT_FOUND', 'This domain is not attached to the Worker.');
    }
    const client = cloudflareClient(context);
    try {
      await client.detachWorkerDomain(domain.id);
    } catch (error) {
      if (error instanceof CloudflareApiError) {
        await repository.markDomainDetaching(domain.id, {
          status: error.status,
          message: error.message,
        });
        throw new AppError(
          502,
          'DOMAIN_DETACH_PENDING',
          `Cloudflare could not detach ${domain.hostname} yet: ${error.message}. WorkerDeck kept the domain in a detaching state and will retry automatically.`,
          {
            providerStatus: error.status,
            cloudflareErrors: error.errors.map((item) => ({
              code: item.code,
              message: item.message,
            })),
          },
        );
      }
      throw error;
    }
    await repository.removeDomainRecord(domain.id);
    return context.json({ data: { deleted: true }, requestId: context.get('requestId') });
  },
);

app.get('/api/v1/git/github/connection', async (context) => {
  const installations = await new Repository(context.env.DB).listGitHubInstallations();
  const appSlug = context.env.GITHUB_APP_SLUG;
  return context.json({
    data: {
      configured: Boolean(
        context.env.GITHUB_APP_ID && context.env.GITHUB_APP_PRIVATE_KEY && appSlug,
      ),
      appSlug: appSlug ?? null,
      installUrl: null,
      installations: installations.map((installation) => ({
        id: installation.provider_installation_id,
        accountLogin: installation.account_login,
        accountType: installation.account_type,
      })),
    },
    requestId: context.get('requestId'),
  });
});

app.post('/api/v1/git/github/setup', async (context) => {
  const appSlug = context.env.GITHUB_APP_SLUG;
  if (!context.env.GITHUB_APP_ID || !context.env.GITHUB_APP_PRIVATE_KEY || !appSlug) {
    throw new AppError(
      409,
      'GITHUB_APP_NOT_CONFIGURED',
      'Configure the WorkerDeck GitHub App before starting repository access.',
    );
  }
  const state = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  await new Repository(context.env.DB).createGitSetupState(
    await hashText(state),
    context.get('actor'),
  );
  return context.json({
    data: {
      installUrl: `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new?state=${encodeURIComponent(state)}`,
    },
    requestId: context.get('requestId'),
  });
});

app.post('/api/v1/git/github/installations', async (context) => {
  const body = zGithubInstallation.safeParse(await context.req.json().catch(() => null));
  if (!body.success) {
    throw new AppError(
      422,
      'INVALID_GITHUB_INSTALLATION',
      'Choose a valid GitHub App installation.',
    );
  }
  await new Repository(context.env.DB).consumeGitSetupState(
    await hashText(body.data.state),
    context.get('actor'),
  );
  const client = githubAppClient(context);
  const installation = await client.getInstallation(body.data.installationId);
  await new Repository(context.env.DB).saveGitHubInstallation({
    installationId: String(installation.id),
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    actor: context.get('actor'),
    requestId: context.get('requestId'),
  });
  return context.json(
    {
      data: {
        id: String(installation.id),
        accountLogin: installation.account.login,
        accountType: installation.account.type,
      },
      requestId: context.get('requestId'),
    },
    201,
  );
});

app.post('/api/v1/git/github/installations/sync', async (context) => {
  const client = githubAppClient(context);
  const installations = await client.listInstallations();
  const repository = new Repository(context.env.DB);
  await Promise.all(
    installations.map((installation) =>
      repository.saveGitHubInstallation({
        installationId: String(installation.id),
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        actor: context.get('actor'),
        requestId: context.get('requestId'),
      }),
    ),
  );
  return context.json({
    data: installations.map((installation) => ({
      id: String(installation.id),
      accountLogin: installation.account.login,
      accountType: installation.account.type,
    })),
    requestId: context.get('requestId'),
  });
});

app.get('/api/v1/git/github/repositories', async (context) => {
  const installations = await new Repository(context.env.DB).listGitHubInstallations();
  if (installations.length === 0) {
    return context.json({ data: [], requestId: context.get('requestId') });
  }
  const client = githubAppClient(context);
  const repositories = (
    await Promise.all(
      installations.map((installation) =>
        client.listRepositories(installation.provider_installation_id),
      ),
    )
  ).flat();
  const unique = [
    ...new Map(repositories.map((repository) => [repository.id, repository])).values(),
  ];
  return context.json({ data: unique, requestId: context.get('requestId') });
});

app.get('/api/v1/git/github/repositories/:repositoryId/inspection', async (context) => {
  const repositoryId = context.req.param('repositoryId');
  if (!/^\d{1,20}$/.test(repositoryId)) {
    throw new AppError(422, 'INVALID_REPOSITORY', 'Choose a valid GitHub repository.');
  }
  const installations = await new Repository(context.env.DB).listGitHubInstallations();
  const client = githubAppClient(context);
  for (const installation of installations) {
    const repositories = await client.listRepositories(installation.provider_installation_id);
    const selected = repositories.find((repository) => repository.id === repositoryId);
    if (!selected) continue;
    const inspection = repositoryInspectionSchema.parse({
      repositoryId,
      ...(await client.inspectRepository(installation.provider_installation_id, selected)),
    });
    return context.json({ data: inspection, requestId: context.get('requestId') });
  }
  throw new AppError(
    404,
    'REPOSITORY_NOT_FOUND',
    'This repository is not included in a connected GitHub App installation.',
  );
});

app.post('/api/v1/resources', async (context) => {
  const idempotencyKey = requireIdempotencyKey(context);
  const parsed = createResourceInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(
      422,
      'INVALID_RESOURCE',
      'Review the resource fields and try again.',
      parsed.error.flatten(),
    );
  }
  const repository = new Repository(context.env.DB);
  const requestHash = await mutationRequestHash('resource', parsed.data);
  const replay = await repository.getIdempotentResource(
    idempotencyKey,
    context.get('actor'),
    requestHash,
  );
  if (replay) {
    context.header('Idempotency-Replayed', 'true');
    return context.json({ data: replay, requestId: context.get('requestId') }, 201);
  }
  await repository.reserveIdempotencyKey(idempotencyKey, context.get('actor'), requestHash);
  const client = cloudflareClient(context);
  let provisioned: ProvisionedResource | null = null;
  let configuration: Record<string, unknown> = {};
  let status: 'active' | 'adopted' = 'active';
  try {
    ({ provisioned, configuration, status } = await provisionResource(client, parsed.data));
  } catch (error) {
    await repository.removeIdempotencyKey(idempotencyKey);
    throw error;
  }

  try {
    const resource = await repository.recordManagedResource({
      projectId: parsed.data.projectId,
      environmentId: parsed.data.environmentId,
      kind: parsed.data.kind,
      cloudflareId: provisioned.id,
      name: provisioned.name,
      configuration,
      status,
      actor: context.get('actor'),
      requestId: context.get('requestId'),
    });
    await repository.storeIdempotentResource(
      idempotencyKey,
      context.get('actor'),
      requestHash,
      resource,
    );
    return context.json({ data: resource, requestId: context.get('requestId') }, 201);
  } catch (error) {
    if (status === 'active') {
      try {
        await deleteProvisionedResource(client, parsed.data.kind, provisioned);
      } catch (compensationError) {
        console.error(
          JSON.stringify({
            level: 'error',
            requestId: context.get('requestId'),
            message: 'Resource compensation failed.',
            resourceKind: parsed.data.kind,
            resourceId: provisioned.id,
            cause:
              compensationError instanceof Error
                ? compensationError.name
                : 'UNKNOWN_PROVIDER_ERROR',
          }),
        );
      }
    }
    await repository.removeIdempotencyKey(idempotencyKey);
    throw error;
  }
});

app.post('/api/v1/projects', async (context) => {
  const idempotencyKey = requireIdempotencyKey(context);
  const parsed = createProjectInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(
      422,
      'INVALID_PROJECT',
      'Review the project fields and try again.',
      parsed.error.flatten(),
    );
  }
  const repository = new Repository(context.env.DB);
  const requestHash = await mutationRequestHash('project', parsed.data);
  const replay = await repository.getIdempotentProject(
    idempotencyKey,
    context.get('actor'),
    requestHash,
  );
  if (replay) {
    context.header('Idempotency-Replayed', 'true');
    return context.json({ data: replay, requestId: context.get('requestId') }, 201);
  }
  const existingProject = await repository.findProjectBySlug(parsed.data.slug);
  if (existingProject) {
    throw new AppError(409, 'PROJECT_SLUG_EXISTS', 'A project already uses this slug.');
  }
  const existingRepositoryProject = await repository.findProjectByRepository(
    parsed.data.repositoryUrl,
  );
  if (existingRepositoryProject) {
    throw new AppError(
      409,
      'PROJECT_REPOSITORY_EXISTS',
      `This repository is already connected to ${existingRepositoryProject.name}.`,
    );
  }
  await repository.reserveIdempotencyKey(idempotencyKey, context.get('actor'), requestHash);
  if (!parsed.data.repositoryProvider) {
    try {
      const { project } = await repository.createProject(
        parsed.data,
        context.get('actor'),
        context.get('requestId'),
      );
      await repository.storeIdempotentValue(
        idempotencyKey,
        context.get('actor'),
        requestHash,
        project,
      );
      return context.json({ data: project, requestId: context.get('requestId') }, 201);
    } catch (error) {
      await repository.removeIdempotencyKey(idempotencyKey);
      throw error;
    }
  }

  try {
    await repository.acquireProvisioningLock({
      scope: 'repository',
      key: `${parsed.data.repositoryProviderAccountId}:${parsed.data.repositoryId}`,
      actor: context.get('actor'),
      requestId: context.get('requestId'),
    });
  } catch (error) {
    await repository.removeIdempotencyKey(idempotencyKey);
    throw error;
  }

  try {
    const installations = await repository.listGitHubInstallations();
    const github = githubAppClient(context);
    const allowedRepositories = (
      await Promise.all(
        installations.map((installation) =>
          github.listRepositories(installation.provider_installation_id),
        ),
      )
    ).flat();
    const selectedRepository = allowedRepositories.find(
      (candidate) =>
        candidate.id === parsed.data.repositoryId &&
        candidate.ownerId === parsed.data.repositoryProviderAccountId &&
        candidate.url === parsed.data.repositoryUrl,
    );
    if (!selectedRepository) {
      throw new AppError(
        403,
        'REPOSITORY_NOT_AUTHORIZED',
        'The selected repository is not included in a connected GitHub App installation.',
      );
    }

    const client = cloudflareClient(context);
    const workerName = `workerdeck-${parsed.data.slug}`;
    const existingWorker = (await client.listWorkers()).find((worker) => worker.id === workerName);
    const adoptedWorker = existingWorker && parsed.data.adoptExistingWorker ? existingWorker : null;
    if (existingWorker && !adoptedWorker) {
      throw new AppError(
        409,
        'WORKER_NAME_CONFLICT',
        `A Cloudflare Worker named ${workerName} already exists and is not owned by this project. Enable "adopt existing Worker" to attach it instead of creating a duplicate.`,
      );
    }
    const buildToken = await requireBuildToken(context, client);
    const connection = await client.upsertRepositoryConnection({
      provider: 'github',
      providerAccountId: selectedRepository.ownerId,
      providerAccountName: selectedRepository.owner,
      repositoryId: selectedRepository.id,
      repositoryName: selectedRepository.name,
    });
    let workerCreated = false;
    const triggerIds: string[] = [];
    const buildCommand = managedBuildCommand(parsed.data.buildCommand, parsed.data.framework);
    const productionDeployCommand = managedDeployCommand(
      parsed.data.deployCommand,
      false,
      parsed.data.framework,
      parsed.data.outputDirectory,
    );
    const previewDeployCommand = managedDeployCommand(
      parsed.data.deployCommand,
      true,
      parsed.data.framework,
      parsed.data.outputDirectory,
    );
    try {
      const workerTag = adoptedWorker
        ? adoptedWorker.tag
        : (await client.bootstrapWorker(workerName, '2026-08-12')).tag;
      if (!adoptedWorker) {
        workerCreated = true;
        await client.enableWorkerSubdomain(workerName);
      }
      const workersSubdomain = await client.getWorkersSubdomain();
      const productionTrigger = await client.createBuildTrigger({
        workerTag,
        repositoryConnectionId: connection.id,
        buildTokenId: buildToken.id,
        name: 'WorkerDeck production',
        buildCommand,
        deployCommand: productionDeployCommand,
        rootDirectory: parsed.data.rootDirectory,
        branchIncludes: [parsed.data.productionBranch],
        branchExcludes: [],
      });
      triggerIds.push(productionTrigger.id);
      await client.upsertBuildEnvironmentVariable(
        productionTrigger.id,
        workerNameBuildVariable,
        workerName,
        false,
      );
      const previewTrigger = await client.createBuildTrigger({
        workerTag,
        repositoryConnectionId: connection.id,
        buildTokenId: buildToken.id,
        name: 'WorkerDeck previews',
        buildCommand,
        deployCommand: previewDeployCommand,
        rootDirectory: parsed.data.rootDirectory,
        branchIncludes: ['*'],
        branchExcludes: [parsed.data.productionBranch],
      });
      triggerIds.push(previewTrigger.id);
      await client.upsertBuildEnvironmentVariable(
        previewTrigger.id,
        workerNameBuildVariable,
        workerName,
        false,
      );
      const { project, initialDeployment } = await repository.createProject(
        parsed.data,
        context.get('actor'),
        context.get('requestId'),
        {
          workerTag,
          buildTriggerId: productionTrigger.id,
          previewBuildTriggerId: previewTrigger.id,
          workerUrl: `https://${workerName}.${workersSubdomain}.workers.dev`,
          adopted: Boolean(adoptedWorker),
        },
      );
      try {
        const build = await client.triggerBuild(productionTrigger.id, {
          branch: parsed.data.productionBranch,
        });
        if (initialDeployment) await repository.attachBuild(initialDeployment.id, build);
      } catch (error) {
        if (initialDeployment) {
          await repository.failDeployment(
            initialDeployment.id,
            error instanceof Error ? error.name : 'UNKNOWN_PROVIDER_ERROR',
            context.get('actor'),
            context.get('requestId'),
          );
        }
        console.error(
          JSON.stringify({
            level: 'error',
            requestId: context.get('requestId'),
            message:
              'Initial project build could not be started; the connected push trigger remains active.',
            projectId: project.id,
            triggerId: productionTrigger.id,
            cause: error instanceof Error ? error.name : 'UNKNOWN_PROVIDER_ERROR',
          }),
        );
      }
      await repository.storeIdempotentValue(
        idempotencyKey,
        context.get('actor'),
        requestHash,
        project,
      );
      return context.json({ data: project, requestId: context.get('requestId') }, 201);
    } catch (error) {
      const cleanupResults = await Promise.allSettled([
        ...triggerIds.map((triggerId) => client.deleteBuildTrigger(triggerId)),
        ...(workerCreated ? [client.deleteWorker(workerName)] : []),
      ]);
      if (cleanupResults.some((result) => result.status === 'rejected')) {
        console.error(
          JSON.stringify({
            level: 'error',
            requestId: context.get('requestId'),
            message: 'Project bootstrap compensation failed.',
            workerName,
          }),
        );
      }
      await repository.removeIdempotencyKey(idempotencyKey);
      throw error;
    }
  } finally {
    await repository.releaseProvisioningLock(
      'repository',
      `${parsed.data.repositoryProviderAccountId}:${parsed.data.repositoryId}`,
    );
  }
});

app.get('/api/v1/projects/:projectId/environments/:environmentId/variables', async (context) => {
  const repository = new Repository(context.env.DB);
  const target = await repository.getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  const client = cloudflareClient(context);
  const worker = (await client.listWorkers()).find(
    (candidate) => candidate.id === target.workerName,
  );
  const [buildVariables, runtimeSecrets] = await Promise.all([
    target.buildTriggerId
      ? client.listBuildEnvironmentVariables(target.buildTriggerId)
      : Promise.resolve([]),
    worker ? client.listWorkerSecrets(target.workerName) : Promise.resolve([]),
  ]);
  return context.json({
    data: {
      environmentId: target.environmentId,
      workerName: target.workerName,
      buildConnected: Boolean(target.buildTriggerId),
      runtimeConnected: Boolean(worker),
      variables: [
        ...buildVariables
          .filter((variable) => variable.key !== workerNameBuildVariable)
          .map((variable) => ({
            key: variable.key,
            target: 'build' as const,
            secret: variable.isSecret,
            value: variable.value,
            createdAt: variable.createdOn,
          })),
        ...runtimeSecrets.map((secret) => ({
          key: secret.name,
          target: 'runtime_secret' as const,
          secret: true,
          value: null,
          createdAt: null,
        })),
      ],
    },
    requestId: context.get('requestId'),
  });
});

app.put(
  '/api/v1/projects/:projectId/environments/:environmentId/variables/:key',
  async (context) => {
    const key = environmentVariableKeySchema.safeParse(context.req.param('key'));
    const input = upsertEnvironmentVariableInputSchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!key.success || !input.success) {
      throw new AppError(
        422,
        'INVALID_ENVIRONMENT_VARIABLE',
        'Review the variable name, target, and value.',
      );
    }
    if (key.data === workerNameBuildVariable) {
      throw new AppError(
        422,
        'RESERVED_ENVIRONMENT_VARIABLE',
        'That build variable is managed by WorkerDeck.',
      );
    }
    const repository = new Repository(context.env.DB);
    const target = await repository.getDeploymentTarget(
      context.req.param('projectId'),
      context.req.param('environmentId'),
    );
    const client = cloudflareClient(context);
    if (input.data.target === 'build') {
      if (!target.buildTriggerId) {
        throw new AppError(
          409,
          'BUILD_NOT_CONNECTED',
          'Connect this project to Workers Builds before adding build variables.',
        );
      }
      await client.upsertBuildEnvironmentVariable(
        target.buildTriggerId,
        key.data,
        input.data.value,
        input.data.secret,
      );
    } else {
      const workerExists = (await client.listWorkers()).some(
        (candidate) => candidate.id === target.workerName,
      );
      if (!workerExists) {
        throw new AppError(
          409,
          'WORKER_NOT_CONNECTED',
          'Deploy this Worker once before adding runtime secrets.',
        );
      }
      await client.putWorkerSecret(target.workerName, key.data, input.data.value);
    }
    await repository.recordEnvironmentVariableAudit({
      action: 'updated',
      projectId: target.projectId,
      environmentId: target.environmentId,
      key: key.data,
      target: input.data.target,
      secret: input.data.secret,
      actor: context.get('actor'),
      requestId: context.get('requestId'),
    });
    return context.json(
      {
        data: {
          key: key.data,
          target: input.data.target,
          secret: input.data.secret,
          value: input.data.secret ? null : input.data.value,
          createdAt: new Date().toISOString(),
        },
        requestId: context.get('requestId'),
      },
      200,
    );
  },
);

app.delete(
  '/api/v1/projects/:projectId/environments/:environmentId/variables/:key',
  async (context) => {
    const key = environmentVariableKeySchema.safeParse(context.req.param('key'));
    const targetType = context.req.query('target');
    if (!key.success || (targetType !== 'build' && targetType !== 'runtime_secret')) {
      throw new AppError(
        422,
        'INVALID_ENVIRONMENT_VARIABLE',
        'Choose the exact variable and target to remove.',
      );
    }
    if (key.data === workerNameBuildVariable) {
      throw new AppError(
        422,
        'RESERVED_ENVIRONMENT_VARIABLE',
        'That build variable is managed by WorkerDeck.',
      );
    }
    const repository = new Repository(context.env.DB);
    const target = await repository.getDeploymentTarget(
      context.req.param('projectId'),
      context.req.param('environmentId'),
    );
    const client = cloudflareClient(context);
    if (targetType === 'build') {
      if (!target.buildTriggerId) {
        throw new AppError(409, 'BUILD_NOT_CONNECTED', 'This environment has no build trigger.');
      }
      await client.deleteBuildEnvironmentVariable(target.buildTriggerId, key.data);
    } else {
      await client.deleteWorkerSecret(target.workerName, key.data);
    }
    await repository.recordEnvironmentVariableAudit({
      action: 'deleted',
      projectId: target.projectId,
      environmentId: target.environmentId,
      key: key.data,
      target: targetType,
      secret: targetType === 'runtime_secret',
      actor: context.get('actor'),
      requestId: context.get('requestId'),
    });
    return context.json({ data: { deleted: true }, requestId: context.get('requestId') });
  },
);

app.post('/api/v1/projects/:projectId/deployments', async (context) => {
  const parsed = createDeploymentInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(
      422,
      'INVALID_DEPLOYMENT',
      'Review the deployment fields and try again.',
      parsed.error.flatten(),
    );
  }
  const repository = new Repository(context.env.DB);
  const idempotencyKey = requireIdempotencyKey(context);
  const requestHash = await deploymentRequestHash(context.req.param('projectId'), parsed.data);
  const replay = await repository.getIdempotentDeployment(
    idempotencyKey,
    context.get('actor'),
    requestHash,
  );
  if (replay) {
    context.header('Idempotency-Replayed', 'true');
    return context.json({ data: replay, requestId: context.get('requestId') }, 202);
  }
  const target = await repository.getDeploymentTarget(
    context.req.param('projectId'),
    parsed.data.environmentId,
  );
  const client = cloudflareClient(context);
  let triggerId = target.buildTriggerId;

  if (!triggerId) {
    const worker = (await client.listWorkers()).find(
      (candidate) => candidate.id === target.workerName,
    );
    if (!worker?.tag) {
      throw new AppError(
        409,
        'WORKER_NOT_CONNECTED',
        `Create the ${target.workerName} Worker and connect its repository in Cloudflare before the first deployment.`,
      );
    }
    const branch = parsed.data.branch ?? target.productionBranch;
    const triggers = await client.listBuildTriggers(worker.tag);
    const trigger = triggers.find(
      (candidate) =>
        candidate.branchIncludes.includes(branch) || candidate.branchIncludes.includes('*'),
    );
    if (!trigger) {
      throw new AppError(
        409,
        'BUILD_TRIGGER_NOT_CONNECTED',
        `Connect the ${target.workerName} Worker to its repository and configure a ${branch} build trigger.`,
      );
    }
    triggerId = trigger.id;
    await repository.saveBuildTarget(target.environmentId, worker.tag, trigger.id);
  }

  const deployment = await repository.createDeployment(
    target.projectId,
    { ...parsed.data, branch: parsed.data.branch ?? target.productionBranch },
    context.get('actor'),
    context.get('requestId'),
  );
  await repository.storeIdempotentDeployment(
    idempotencyKey,
    context.get('actor'),
    requestHash,
    deployment,
  );

  try {
    const build = await client.triggerBuild(triggerId, {
      branch: parsed.data.branch ?? target.productionBranch,
      ...(parsed.data.commitSha ? { commitSha: parsed.data.commitSha } : {}),
    });
    const building = await repository.attachBuild(deployment.id, build);
    await repository.storeIdempotentDeployment(
      idempotencyKey,
      context.get('actor'),
      requestHash,
      building,
    );
    return context.json({ data: building, requestId: context.get('requestId') }, 202);
  } catch (error) {
    await repository.failDeployment(
      deployment.id,
      error instanceof Error ? error.name : 'UNKNOWN_PROVIDER_ERROR',
      context.get('actor'),
      context.get('requestId'),
    );
    await repository.removeIdempotencyKey(idempotencyKey);
    throw error;
  }
});

app.get('/api/v1/deployments/:deploymentId', async (context) => {
  const deployment = await new Repository(context.env.DB).requireDeployment(
    context.req.param('deploymentId'),
  );
  return context.json({ data: deployment, requestId: context.get('requestId') });
});

app.get('/api/v1/deployments/:deploymentId/logs', async (context) => {
  const deployment = await new Repository(context.env.DB).requireDeployment(
    context.req.param('deploymentId'),
  );
  if (!deployment.buildId) {
    throw new AppError(409, 'BUILD_NOT_STARTED', 'This deployment does not have build logs yet.');
  }
  const logs = await cloudflareClient(context).getBuildLogs(
    deployment.buildId,
    context.req.query('cursor'),
  );
  const diagnosis =
    deployment.status === 'failed'
      ? diagnoseBuildFailure(logs.lines.map((line) => line.message))
      : null;
  return context.json({
    data: { buildId: deployment.buildId, ...logs, diagnosis },
    requestId: context.get('requestId'),
  });
});

app.delete('/api/v1/deployments/:deploymentId', async (context) => {
  const repository = new Repository(context.env.DB);
  const deployment = await repository.requireDeployment(context.req.param('deploymentId'));
  if (['queued', 'building', 'deploying'].includes(deployment.status)) {
    throw new AppError(
      409,
      'DEPLOYMENT_ACTIVE',
      'Cancel or wait for this deployment to finish before deleting it.',
    );
  }
  const target = await repository.getDeploymentTarget(
    deployment.projectId,
    deployment.environmentId,
  );
  if (deployment.workerVersionId) {
    const client = cloudflareClient(context);
    const providerDeployments = await client.listDeployments(target.workerName);
    const current = providerDeployments[0];
    if (current?.versions.some((version) => version.versionId === deployment.workerVersionId)) {
      throw new AppError(
        409,
        'DEPLOYMENT_SERVING_TRAFFIC',
        'The currently serving deployment cannot be deleted. Deploy or roll back first.',
      );
    }
    const providerDeployment = providerDeployments.find((candidate) =>
      candidate.versions.some((version) => version.versionId === deployment.workerVersionId),
    );
    if (providerDeployment) {
      await ignoreCloudflareNotFound(() =>
        client.deleteDeployment(target.workerName, providerDeployment.id),
      );
    }
  }
  await repository.deleteDeploymentRecord(
    deployment.id,
    context.get('actor'),
    context.get('requestId'),
  );
  return context.json({ data: { deleted: true }, requestId: context.get('requestId') });
});

app.post('/api/v1/deployments/:deploymentId/sync', async (context) => {
  const repository = new Repository(context.env.DB);
  const deployment = await repository.requireDeployment(context.req.param('deploymentId'));
  if (
    !deployment.buildId ||
    ['ready', 'failed', 'cancelled', 'rolled_back'].includes(deployment.status)
  ) {
    return context.json({ data: deployment, requestId: context.get('requestId') });
  }

  const target = await repository.getDeploymentTarget(
    deployment.projectId,
    deployment.environmentId,
  );
  const client = cloudflareClient(context);
  const build = await client.getBuild(deployment.buildId);
  let workerVersionId: string | null = null;
  if (build.status === 'stopped' && build.outcome === 'success') {
    const activeDeployment = (await client.listDeployments(target.workerName))[0];
    const buildStartedAt = new Date(build.startedOn ?? build.createdOn).getTime();
    const deploymentCreatedAt = activeDeployment
      ? new Date(activeDeployment.createdOn).getTime()
      : Number.NEGATIVE_INFINITY;
    if (deploymentCreatedAt >= buildStartedAt) {
      workerVersionId =
        activeDeployment?.versions.find((version) => version.percentage === 100)?.versionId ?? null;
    }
  }
  const reconciled = await repository.reconcileBuild(
    deployment.id,
    build,
    workerVersionId,
    context.get('actor'),
    context.get('requestId'),
  );
  return context.json({ data: reconciled, requestId: context.get('requestId') });
});

app.post('/api/v1/deployments/:deploymentId/cancel', async (context) => {
  const repository = new Repository(context.env.DB);
  const deployment = await repository.requireDeployment(context.req.param('deploymentId'));
  if (!['queued', 'building', 'deploying'].includes(deployment.status)) {
    throw new AppError(409, 'DEPLOYMENT_NOT_CANCELLABLE', 'This deployment is already complete.');
  }
  if (deployment.buildId) await cloudflareClient(context).cancelBuild(deployment.buildId);
  const cancelled = await repository.cancelDeployment(
    deployment.id,
    context.get('actor'),
    context.get('requestId'),
  );
  return context.json({ data: cancelled, requestId: context.get('requestId') });
});

app.post('/api/v1/deployments/:deploymentId/rollback', async (context) => {
  const idempotencyKey = requireIdempotencyKey(context);
  const parsed = rollbackDeploymentInputSchema.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success || parsed.data.targetDeploymentId !== context.req.param('deploymentId')) {
    throw new AppError(
      422,
      'INVALID_ROLLBACK',
      'Confirm the exact deployment before rolling back.',
    );
  }
  const repository = new Repository(context.env.DB);
  const requestHash = await mutationRequestHash('rollback', parsed.data);
  const replay = await repository.getIdempotentDeployment(
    idempotencyKey,
    context.get('actor'),
    requestHash,
  );
  if (replay) {
    context.header('Idempotency-Replayed', 'true');
    return context.json({ data: replay, requestId: context.get('requestId') }, 201);
  }
  const target = await repository.requireDeployment(parsed.data.targetDeploymentId);
  if (!target.workerVersionId || !['ready', 'rolled_back'].includes(target.status)) {
    throw new AppError(
      409,
      'VERSION_NOT_ROLLBACKABLE',
      'This deployment does not contain a restorable Worker version.',
    );
  }
  const runtime = await repository.getDeploymentTarget(target.projectId, target.environmentId);
  if (runtime.environmentKind !== 'production') {
    throw new AppError(
      409,
      'PREVIEW_NOT_ROLLBACKABLE',
      'Preview versions cannot be rolled back into production. Deploy or promote them explicitly.',
    );
  }
  await repository.reserveIdempotencyKey(idempotencyKey, context.get('actor'), requestHash);
  try {
    await cloudflareClient(context).deployVersion(
      runtime.workerName,
      target.workerVersionId,
      `WorkerDeck rollback to ${target.gitCommitSha ?? target.workerVersionId}`,
    );
    const rollback = await repository.recordRollback(
      target,
      context.get('actor'),
      context.get('requestId'),
    );
    await repository.storeIdempotentDeployment(
      idempotencyKey,
      context.get('actor'),
      requestHash,
      rollback,
    );
    return context.json({ data: rollback, requestId: context.get('requestId') }, 201);
  } catch (error) {
    await repository.removeIdempotencyKey(idempotencyKey);
    throw error;
  }
});

app.get('/api/v1/projects/:projectId/environments/:environmentId/traffic', async (context) => {
  const target = await new Repository(context.env.DB).getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  const deployments = await cloudflareClient(context).listDeployments(target.workerName);
  return context.json({ data: deployments[0] ?? null, requestId: context.get('requestId') });
});

app.post('/api/v1/projects/:projectId/environments/:environmentId/traffic', async (context) => {
  const parsed = setTrafficInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(
      422,
      'INVALID_TRAFFIC',
      'Traffic percentages must total 100 and reference valid Worker versions.',
      parsed.error.flatten(),
    );
  }
  const repository = new Repository(context.env.DB);
  const target = await repository.getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  if (target.environmentKind !== 'production') {
    throw new AppError(
      409,
      'PREVIEW_TRAFFIC_LOCKED',
      'Traffic routing applies to production only.',
    );
  }
  await cloudflareClient(context).setVersionTraffic(
    target.workerName,
    parsed.data.versions,
    parsed.data.message ?? 'WorkerDeck traffic update',
  );
  return context.json({ data: { updated: true }, requestId: context.get('requestId') });
});

app.put('/api/v1/projects/:projectId/environments/:environmentId/subdomain', async (context) => {
  const parsed = z
    .object({ enabled: z.boolean() })
    .safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(422, 'INVALID_SUBDOMAIN', 'Choose whether the system subdomain is enabled.');
  }
  const repository = new Repository(context.env.DB);
  const target = await repository.getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  await cloudflareClient(context).setWorkerSubdomainEnabled(target.workerName, parsed.data.enabled);
  if (parsed.data.enabled) {
    const subdomain = await cloudflareClient(context).getWorkersSubdomain();
    await repository.saveEnvironmentUrl(
      target.environmentId,
      `https://${target.workerName}.${subdomain}.workers.dev`,
    );
  } else {
    await repository.clearEnvironmentUrl(target.environmentId);
  }
  return context.json({
    data: { enabled: parsed.data.enabled },
    requestId: context.get('requestId'),
  });
});

app.get('/api/v1/projects/:projectId/environments/:environmentId/cron', async (context) => {
  const target = await new Repository(context.env.DB).getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  const schedules = await cloudflareClient(context).listCronTriggers(target.workerName);
  return context.json({ data: schedules, requestId: context.get('requestId') });
});

app.put('/api/v1/projects/:projectId/environments/:environmentId/cron', async (context) => {
  const parsed = setCronSchedulesInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(
      422,
      'INVALID_CRON_SCHEDULES',
      'Use up to five valid cron expressions.',
      parsed.error.flatten(),
    );
  }
  const repository = new Repository(context.env.DB);
  const target = await repository.getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  await cloudflareClient(context).setCronTriggers(target.workerName, parsed.data.schedules);
  const schedules = await cloudflareClient(context).listCronTriggers(target.workerName);
  await repository.recordEnvironmentVariableAudit({
    action: 'updated',
    projectId: target.projectId,
    environmentId: target.environmentId,
    key: 'cron_schedules',
    target: 'build',
    secret: false,
    actor: context.get('actor'),
    requestId: context.get('requestId'),
  });
  return context.json({ data: schedules, requestId: context.get('requestId') });
});

app.get(
  '/api/v1/projects/:projectId/environments/:environmentId/analytics/web',
  async (context) => {
    const data = await webAnalytics(
      context,
      context.req.param('projectId'),
      context.req.param('environmentId'),
      analyticsRange(context),
    );
    return context.json({ data, requestId: context.get('requestId') });
  },
);

app.get('/api/v1/projects/:projectId/environments/:environmentId/cache', async (context) => {
  const target = await new Repository(context.env.DB).getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  return context.json({
    data: await projectCacheData(context, target),
    requestId: context.get('requestId'),
  });
});

app.put('/api/v1/projects/:projectId/environments/:environmentId/cache/rules', async (context) => {
  const parsed = setCacheRulesInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(
      422,
      'INVALID_CACHE_RULES',
      'Use up to 25 path rules with TTLs between 0 seconds and 30 days.',
      parsed.error.flatten(),
    );
  }
  const seenPaths = new Set<string>();
  for (const rule of parsed.data.rules) {
    if (seenPaths.has(rule.pathExpression)) {
      throw new AppError(
        422,
        'DUPLICATE_CACHE_PATH',
        `The path ${rule.pathExpression} appears more than once.`,
      );
    }
    seenPaths.add(rule.pathExpression);
  }
  const repository = new Repository(context.env.DB);
  const target = await repository.getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  await repository.replaceCacheRules(
    target.projectId,
    parsed.data.rules,
    context.get('actor'),
    context.get('requestId'),
  );
  const rules = await repository.listCacheRules(target.projectId);
  await syncCacheRulesToZones(context, target, rules);
  return context.json({
    data: await projectCacheData(context, target),
    requestId: context.get('requestId'),
  });
});

app.put(
  '/api/v1/projects/:projectId/environments/:environmentId/cache/settings',
  async (context) => {
    const parsed = cacheSettingsInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError(
        422,
        'INVALID_CACHE_SETTINGS',
        'Choose a valid KV namespace for revalidation hints.',
      );
    }
    const repository = new Repository(context.env.DB);
    const target = await repository.getDeploymentTarget(
      context.req.param('projectId'),
      context.req.param('environmentId'),
    );
    if (parsed.data.revalidationNamespaceResourceId) {
      const resources = await repository.listManagedResources();
      const namespace = resources.find(
        (resource) =>
          resource.id === parsed.data.revalidationNamespaceResourceId &&
          resource.kind === 'kv' &&
          resource.projectId === target.projectId,
      );
      if (!namespace) {
        throw new AppError(
          409,
          'REVALIDATION_NAMESPACE_INVALID',
          'That KV namespace is not owned by this project.',
        );
      }
    }
    await repository.setCacheSettings(
      target.projectId,
      parsed.data.revalidationNamespaceResourceId,
      context.get('actor'),
      context.get('requestId'),
    );
    return context.json({
      data: await projectCacheData(context, target),
      requestId: context.get('requestId'),
    });
  },
);

app.post('/api/v1/projects/:projectId/environments/:environmentId/cache/purge', async (context) => {
  const parsed = purgeCacheInputSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(422, 'INVALID_CACHE_PURGE', 'Only full-zone purges are supported.');
  }
  const repository = new Repository(context.env.DB);
  const target = await repository.getDeploymentTarget(
    context.req.param('projectId'),
    context.req.param('environmentId'),
  );
  const zones = await projectCacheZones(context, target);
  if (zones.length === 0) {
    throw new AppError(
      409,
      'CACHE_ZONE_REQUIRED',
      'Attach a custom domain before purging. workers.dev subdomains have no zone cache to purge.',
    );
  }
  const purgedZones = await Promise.all(
    zones.map(async (zone) => {
      await cloudflareClient(context).purgeZoneCache(zone.zoneId);
      return { zoneId: zone.zoneId, zoneName: zone.zoneName };
    }),
  );
  return context.json({ data: { purgedZones }, requestId: context.get('requestId') }, 201);
});

app.post(
  '/api/v1/projects/:projectId/environments/:environmentId/cache/revalidate',
  async (context) => {
    const parsed = revalidateCacheInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError(
        422,
        'INVALID_REVALIDATION',
        'Choose between 1 and 25 valid path patterns to revalidate.',
      );
    }
    const repository = new Repository(context.env.DB);
    const target = await repository.getDeploymentTarget(
      context.req.param('projectId'),
      context.req.param('environmentId'),
    );
    const hints = await revalidateProjectCache(context, target, parsed.data.paths);
    return context.json({ data: { hints }, requestId: context.get('requestId') }, 201);
  },
);

app.get('/api/v1/cloudflare/durable-objects/namespaces', async (context) => {
  const namespaces = await cloudflareClient(context).listDurableObjectNamespaces();
  return context.json({ data: namespaces, requestId: context.get('requestId') });
});

app.get('/api/v1/cloudflare/connection', async (context) => {
  const token = context.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return context.json({
      data: { connected: false, account: null, reason: 'CLOUDFLARE_API_TOKEN is not configured.' },
      requestId: context.get('requestId'),
    });
  }
  const accounts = await new CloudflareClient({ token }).listAccounts();
  const account = context.env.CLOUDFLARE_ACCOUNT_ID
    ? (accounts.find((candidate) => candidate.id === context.env.CLOUDFLARE_ACCOUNT_ID) ?? null)
    : (accounts[0] ?? null);
  return context.json({
    data: {
      connected: Boolean(account),
      account,
      reason: account ? null : 'No accessible account was found.',
    },
    requestId: context.get('requestId'),
  });
});

app.notFound((context) => {
  if (new URL(context.req.url).pathname.startsWith('/api/')) {
    return context.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'This API route does not exist.',
          requestId: context.get('requestId'),
        },
      },
      404,
    );
  }
  return context.env.ASSETS.fetch(context.req.raw);
});

app.onError((error, context) => {
  const requestId = context.get('requestId') || crypto.randomUUID();
  const providerError = error instanceof CloudflareApiError ? error : null;
  const appError =
    error instanceof AppError
      ? error
      : providerError
        ? new AppError(
            providerError.status === 429 ? 429 : 502,
            'CLOUDFLARE_API_ERROR',
            providerError.status === 403
              ? 'Cloudflare rejected the configured API token or its permissions.'
              : `Cloudflare could not complete the requested operation: ${providerError.message}`,
            {
              providerStatus: providerError.status,
              cloudflareErrors: providerError.errors.map((item) => ({
                code: item.code,
                message: item.message,
              })),
            },
          )
        : null;
  const status = appError?.status ?? 500;

  if (!appError) {
    console.error(
      JSON.stringify({ level: 'error', requestId, name: error.name, message: error.message }),
    );
  }

  return context.json(
    {
      error: {
        code: appError?.code ?? 'INTERNAL_ERROR',
        message: appError?.message ?? 'WorkerDeck could not complete this request.',
        requestId,
        ...(appError?.details === undefined ? {} : { details: appError.details }),
      },
    },
    status,
  );
});

export default {
  fetch: app.fetch,
  scheduled(_controller, env, executionContext) {
    executionContext.waitUntil(syncProviderBuilds(env));
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;

async function syncProviderBuilds(env: AppEnv['Bindings']): Promise<void> {
  const repository = new Repository(env.DB);
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    await repository.recordBuildSyncHealth({
      checkedAt: new Date().toISOString(),
      targetCount: 0,
      status: 'disconnected',
      message:
        'Cloudflare credentials are not configured, so build reconciliation is paused. Store the control-plane API token and account ID to resume.',
      failures: [],
    });
    return;
  }
  const targets = await repository.nextBuildSyncTargets();
  const client = new CloudflareClient({
    token: env.CLOUDFLARE_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
  });
  const workersSubdomain = await providerSyncStep(
    'read Workers subdomain',
    client.getWorkersSubdomain(),
  );
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      await repository.saveEnvironmentUrl(
        target.productionEnvironmentId,
        `https://${target.workerName}.${workersSubdomain}.workers.dev`,
      );
      const [builds, versions, triggers] = await Promise.all([
        providerSyncStep('list builds', client.listBuilds(target.workerTag, 50)),
        providerSyncStep('list Worker versions', client.listWorkerVersions(target.workerName, 20)),
        providerSyncStep('list build triggers', client.listBuildTriggers(target.workerTag)),
      ]);
      await Promise.all(
        triggers.map(async (trigger) => {
          const isPreview =
            trigger.branchIncludes.includes('*') &&
            trigger.branchExcludes.includes(target.productionBranch);
          const deployCommand = trigger.deployCommand
            ? managedDeployCommand(
                trigger.deployCommand,
                isPreview,
                target.framework,
                target.outputDirectory,
              )
            : managedDeployCommand(
                'npx wrangler deploy',
                isPreview,
                target.framework,
                target.outputDirectory,
              );
          const buildCommand = managedBuildCommand(
            trigger.buildCommand ?? 'npm run build',
            target.framework,
          );
          const variables = await client.listBuildEnvironmentVariables(trigger.id);
          const workerNameVariable = variables.find(
            (variable) => variable.key === workerNameBuildVariable,
          );
          await Promise.all([
            ...(workerNameVariable?.value !== target.workerName || workerNameVariable.isSecret
              ? [
                  client.upsertBuildEnvironmentVariable(
                    trigger.id,
                    workerNameBuildVariable,
                    target.workerName,
                    false,
                  ),
                ]
              : []),
            ...(trigger.deployCommand !== deployCommand || trigger.buildCommand !== buildCommand
              ? [client.updateBuildTrigger(trigger.id, { buildCommand, deployCommand })]
              : []),
          ]);
        }),
      );
      if (!target.productionTriggerId) {
        target.productionTriggerId =
          triggers.find((trigger) => trigger.branchIncludes.includes(target.productionBranch))
            ?.id ?? null;
        if (target.productionTriggerId) {
          await repository.saveBuildTarget(
            target.productionEnvironmentId,
            target.workerTag,
            target.productionTriggerId,
          );
        }
      }
      if (!target.previewTriggerId) {
        target.previewTriggerId =
          triggers.find(
            (trigger) =>
              trigger.branchIncludes.includes('*') &&
              trigger.branchExcludes.includes(target.productionBranch),
          )?.id ?? null;
        if (target.previewTriggerId) {
          await repository.saveBuildTarget(
            target.previewEnvironmentId,
            target.workerTag,
            target.previewTriggerId,
          );
        }
      }
      const workerDomains = await providerSyncStep(
        'list Worker domains',
        client.listWorkerDomains(target.workerName),
      );
      await repository.syncProviderDomains({
        projectId: target.projectId,
        environmentId: target.productionEnvironmentId,
        domains: workerDomains,
      });
      const buildsByVersion = await client.getBuildsByVersionIds(
        versions.map((version) => version.id),
      );
      const versionByBuildId = new Map(
        buildsByVersion.map(({ versionId, build }) => [build.id, versionId]),
      );
      for (const build of [...builds].sort((left, right) =>
        right.createdOn.localeCompare(left.createdOn),
      )) {
        const ownedTriggerIds = new Set(
          [target.productionTriggerId, target.previewTriggerId].filter(
            (triggerId): triggerId is string => Boolean(triggerId),
          ),
        );
        if (!build.triggerId || !ownedTriggerIds.has(build.triggerId)) {
          continue;
        }
        await repository.recordProviderBuild({
          target,
          build,
          workerVersionId: versionByBuildId.get(build.id) ?? null,
          actor: 'automation@workerdeck',
          requestId: crypto.randomUUID(),
        });
      }
      await retryFailedProductionBuild(repository, client, target);
    }),
  );
  const failures = results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const target = targets[index];
    if (!target) return [];
    const message =
      result.reason instanceof CloudflareApiError
        ? `Cloudflare API ${result.reason.status}: ${result.reason.message}`
        : result.reason instanceof Error
          ? result.reason.name
          : 'Unknown provider error';
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'build_sync_failed',
        projectId: target.projectId,
        workerName: target.workerName,
        message,
      }),
    );
    return [{ projectId: target.projectId, message }];
  });
  await retryDetachingDomains(repository, client);
  await repository.recordBuildSyncHealth({
    checkedAt: new Date().toISOString(),
    targetCount: targets.length,
    status: failures.length === 0 ? 'ok' : 'degraded',
    message:
      failures.length === 0
        ? null
        : `${failures.length} project${failures.length === 1 ? '' : 's'} could not be reconciled with Cloudflare.`,
    failures,
  });
}

async function retryDetachingDomains(
  repository: Repository,
  client: CloudflareClient,
): Promise<void> {
  const detaching = await repository.listDetachingDomains();
  await Promise.all(
    detaching.map(async (domain) => {
      try {
        await client.detachWorkerDomain(domain.cloudflareId);
        await repository.removeDomainRecordById(domain.id);
      } catch (error) {
        if (error instanceof CloudflareApiError) {
          if (error.status === 404) {
            await repository.removeDomainRecordById(domain.id);
            return;
          }
          await repository.updateDomainDetachError(domain.id, {
            status: error.status,
            message: error.message,
          });
          return;
        }
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'domain_detach_retry_failed',
            resourceId: domain.id,
            cloudflareId: domain.cloudflareId,
            cause: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
          }),
        );
      }
    }),
  );
}

async function retryFailedProductionBuild(
  repository: Repository,
  client: CloudflareClient,
  target: Awaited<ReturnType<Repository['nextBuildSyncTargets']>>[number],
): Promise<void> {
  if (!target.productionTriggerId) return;
  const [latest, alreadyRetried] = await Promise.all([
    repository.latestDeploymentForEnvironment(target.productionEnvironmentId),
    repository.hasBuildRepairRetry(buildRepairRevision, target.projectId),
  ]);
  if (!latest || latest.status !== 'failed' || alreadyRetried) return;

  const requestId = crypto.randomUUID();
  const actor = 'repair@workerdeck';
  const deployment = await repository.createDeployment(
    target.projectId,
    {
      environmentId: target.productionEnvironmentId,
      branch: target.productionBranch,
      ...(latest.gitCommitSha ? { commitSha: latest.gitCommitSha } : {}),
    },
    actor,
    requestId,
  );
  try {
    const build = await client.triggerBuild(target.productionTriggerId, {
      branch: target.productionBranch,
      ...(latest.gitCommitSha ? { commitSha: latest.gitCommitSha } : {}),
    });
    await repository.attachBuild(deployment.id, build);
    await repository.recordBuildRepairRetry({
      revision: buildRepairRevision,
      projectId: target.projectId,
      deploymentId: deployment.id,
      outcome: 'triggered',
    });
  } catch (error) {
    await repository.failDeployment(
      deployment.id,
      error instanceof Error ? error.name : 'UNKNOWN_PROVIDER_ERROR',
      actor,
      requestId,
    );
    await repository.recordBuildRepairRetry({
      revision: buildRepairRevision,
      projectId: target.projectId,
      deploymentId: deployment.id,
      outcome: 'failed',
    });
    throw error;
  }
}

async function providerSyncStep<T>(step: string, promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      throw new CloudflareApiError(`${step}: ${error.message}`, error.status, error.errors);
    }
    throw error;
  }
}

async function ignoreCloudflareNotFound(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof CloudflareApiError && error.status === 404) return;
    throw error;
  }
}

async function provisionResource(
  client: CloudflareClient,
  input: CreateResourceInput,
): Promise<{
  provisioned: ProvisionedResource;
  configuration: Record<string, unknown>;
  status: 'active' | 'adopted';
}> {
  switch (input.kind) {
    case 'd1':
      return {
        provisioned: await client.createD1Database(input.name),
        configuration: {},
        status: 'active',
      };
    case 'kv':
      return {
        provisioned: await client.createKvNamespace(input.name),
        configuration: {},
        status: 'active',
      };
    case 'r2':
      return {
        provisioned: await client.createR2Bucket(input.name),
        configuration: {},
        status: 'active',
      };
    case 'queue':
      return {
        provisioned: await client.createQueue(input.name),
        configuration: {},
        status: 'active',
      };
    case 'hyperdrive':
      return {
        provisioned: await client.createHyperdrive(input.name, input.origin),
        configuration: {
          origin: {
            database: input.origin.database,
            host: input.origin.host,
            port: input.origin.port,
            scheme: input.origin.scheme,
            user: input.origin.user,
          },
        },
        status: 'active',
      };
    case 'vectorize':
      return {
        provisioned: await client.createVectorizeIndex(input.name, {
          dimensions: input.dimensions,
          metric: input.metric,
        }),
        configuration: { dimensions: input.dimensions, metric: input.metric },
        status: 'active',
      };
    case 'ai_gateway':
      return {
        provisioned: await client.createAiGateway({
          id: input.name,
          cacheTtl: input.cacheTtl,
          collectLogs: input.collectLogs,
        }),
        configuration: { cacheTtl: input.cacheTtl, collectLogs: input.collectLogs },
        status: 'active',
      };
    case 'workflow':
      return {
        provisioned: await client.createWorkflow({
          name: input.name,
          className: input.className,
          scriptName: input.scriptName,
        }),
        configuration: { className: input.className, scriptName: input.scriptName },
        status: 'active',
      };
    case 'durable_object': {
      const namespaces = await client.listDurableObjectNamespaces();
      const namespace = namespaces.find((candidate) => candidate.id === input.cloudflareId);
      if (!namespace) {
        throw new AppError(
          404,
          'DURABLE_OBJECT_NOT_FOUND',
          'That Durable Object namespace does not exist in this Cloudflare account.',
        );
      }
      return {
        provisioned: { id: namespace.id, name: namespace.name },
        configuration: {
          className: namespace.className,
          scriptName: namespace.scriptName,
          source: 'adopted',
        },
        status: 'adopted',
      };
    }
  }
}

async function deleteProvisionedResource(
  client: CloudflareClient,
  kind: ResourceKind,
  resource: ProvisionedResource,
): Promise<void> {
  switch (kind) {
    case 'd1':
      await client.deleteD1Database(resource.id);
      return;
    case 'kv':
      await client.deleteKvNamespace(resource.id);
      return;
    case 'r2':
      await client.deleteR2Bucket(resource.name);
      return;
    case 'queue':
      await client.deleteQueue(resource.id);
      return;
    case 'hyperdrive':
      await client.deleteHyperdrive(resource.id);
      return;
    case 'vectorize':
      await client.deleteVectorizeIndex(resource.name);
      return;
    case 'ai_gateway':
      await client.deleteAiGateway(resource.id);
      return;
    case 'workflow':
      await client.deleteWorkflow(resource.name);
      return;
    case 'durable_object':
      return;
    case 'worker':
    case 'domain':
      throw new Error(`Provider deletion for ${kind} resources must be dispatched explicitly.`);
  }
}

function cloudflareClient(context: Context<AppEnv>): CloudflareClient {
  const token = context.env.CLOUDFLARE_API_TOKEN;
  const accountId = context.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new AppError(
      409,
      'CLOUDFLARE_NOT_CONNECTED',
      'Configure the Cloudflare account ID and scoped API token before deploying.',
    );
  }
  return new CloudflareClient({ token, accountId });
}

async function dashboardSummary(context: Context<AppEnv>): Promise<DashboardSummary> {
  return new Repository(context.env.DB).dashboard({
    id: context.env.CLOUDFLARE_ACCOUNT_ID ?? null,
    name: context.env.CLOUDFLARE_ACCOUNT_NAME,
    userEmail: actorEmail(context.get('actor')),
    plan: 'unknown',
    connected: Boolean(context.env.CLOUDFLARE_API_TOKEN && context.env.CLOUDFLARE_ACCOUNT_ID),
  });
}

function actorEmail(actor: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor) ? actor : null;
}

function analyticsRange(context: Context<AppEnv>): { from: string; to: string } {
  const requestedHours = Number(context.req.query('hours') ?? 24);
  if (!Number.isInteger(requestedHours) || requestedHours < 1 || requestedHours > 168) {
    throw new AppError(
      422,
      'INVALID_ANALYTICS_RANGE',
      'Analytics ranges must be between 1 and 168 whole hours.',
    );
  }
  const to = new Date();
  return {
    from: new Date(to.getTime() - requestedHours * 60 * 60 * 1000).toISOString(),
    to: to.toISOString(),
  };
}

async function workerAnalytics(
  context: Context<AppEnv>,
  summary: DashboardSummary,
  range: { from: string; to: string },
  includeTimeseries: boolean,
): Promise<WorkerAnalytics> {
  const workerNames = [
    ...new Set(
      summary.environments
        .map((environment) => environment.workerName)
        .filter((workerName): workerName is string => Boolean(workerName)),
    ),
  ];
  const rows = await cloudflareClient(context).getWorkerAnalytics(
    workerNames,
    range.from,
    range.to,
    includeTimeseries,
  );
  const aggregate = (selectedRows: typeof rows) => {
    const requests = selectedRows.reduce((total, row) => total + row.requests, 0);
    const errors = selectedRows.reduce((total, row) => total + row.errors, 0);
    const subrequests = selectedRows.reduce((total, row) => total + row.subrequests, 0);
    const p50 = selectedRows.flatMap((row) => (row.cpuTimeP50 === null ? [] : [row.cpuTimeP50]));
    const p99 = selectedRows.flatMap((row) => (row.cpuTimeP99 === null ? [] : [row.cpuTimeP99]));
    return {
      requests,
      errors,
      subrequests,
      errorRate: requests === 0 ? 0 : Math.min(errors / requests, 1),
      cpuTimeP50: p50.length === 0 ? null : Math.max(...p50),
      cpuTimeP99: p99.length === 0 ? null : Math.max(...p99),
    };
  };
  const pointsFor = (selectedRows: typeof rows) => {
    const byTimestamp = new Map<string, typeof rows>();
    for (const row of selectedRows) {
      const bucket = byTimestamp.get(row.timestamp) ?? [];
      bucket.push(row);
      byTimestamp.set(row.timestamp, bucket);
    }
    return [...byTimestamp.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([timestamp, bucket]) => ({ timestamp, ...aggregate(bucket) }));
  };
  const totals = aggregate(rows);
  return {
    from: range.from,
    to: range.to,
    sampled: true,
    ...totals,
    projects: workerNames.map((workerName) => {
      const workerRows = rows.filter((row) => row.workerName === workerName);
      return {
        workerName,
        ...aggregate(workerRows),
        points: includeTimeseries ? pointsFor(workerRows) : [],
      };
    }),
    points: includeTimeseries ? pointsFor(rows) : [],
  };
}

async function webAnalytics(
  context: Context<AppEnv>,
  projectId: string,
  environmentId: string,
  range: { from: string; to: string },
): Promise<WebAnalytics> {
  const repository = new Repository(context.env.DB);
  const summary = await dashboardSummary(context);
  const environment = summary.environments.find(
    (candidate) => candidate.id === environmentId && candidate.projectId === projectId,
  );
  if (!environment) {
    throw new AppError(404, 'ENVIRONMENT_NOT_FOUND', 'The selected environment does not exist.');
  }
  const hostnames = new Set<string>();
  if (environment.url) hostnames.add(new URL(environment.url).hostname.toLowerCase());
  const domains = await repository.listSyncedDomains();
  for (const domain of domains) {
    if (domain.projectId === projectId && domain.status !== 'detaching') {
      hostnames.add(domain.hostname.toLowerCase());
    }
  }
  const hostnameList = [...hostnames];
  if (hostnameList.length === 0) {
    return aggregateWebAnalytics(range, [], { pageViews: [], vitals: [] });
  }
  const rows = await cloudflareClient(context).getWebAnalytics(range.from, range.to, hostnameList);
  return aggregateWebAnalytics(range, hostnameList, rows);
}

async function projectCacheZones(
  context: Context<AppEnv>,
  target: DeploymentTarget,
): Promise<Array<{ zoneId: string; zoneName: string; hostnames: string[] }>> {
  const domains = await cloudflareClient(context).listWorkerDomains(target.workerName);
  return distinctCacheZones(
    domains.map((domain) => ({
      zoneId: domain.zoneId,
      zoneName: domain.zoneName,
      hostname: domain.hostname,
    })),
  );
}

async function projectCacheData(
  context: Context<AppEnv>,
  target: DeploymentTarget,
): Promise<ProjectCache> {
  const repository = new Repository(context.env.DB);
  const [rules, resources, zones, settings] = await Promise.all([
    repository.listCacheRules(target.projectId),
    repository.listManagedResources(),
    projectCacheZones(context, target),
    repository.getCacheSettings(target.projectId),
  ]);
  const kvResources = resources.filter(
    (resource) => resource.kind === 'kv' && resource.projectId === target.projectId,
  );
  const selected = kvResources.find(
    (resource) => resource.id === settings.revalidationNamespaceResourceId,
  );
  const hints: CacheRevalidationHint[] = [];
  if (selected) {
    const client = cloudflareClient(context);
    for (const rule of rules) {
      const raw = await client.readKvValue(
        selected.cloudflareId,
        revalidationKeyFor(rule.pathExpression),
      );
      hints.push({
        pathExpression: rule.pathExpression,
        revalidatedAt: parseRevalidationTimestamp(raw),
      });
    }
  }
  return {
    rules,
    zones,
    revalidation: {
      namespaceResourceId: selected?.id ?? null,
      namespaceName: selected?.name ?? null,
      availableNamespaces: kvResources.map((resource) => ({
        resourceId: resource.id,
        name: resource.name,
      })),
      hints,
    },
  };
}

async function syncCacheRulesToZones(
  context: Context<AppEnv>,
  target: DeploymentTarget,
  rules: CacheRule[],
): Promise<void> {
  const repository = new Repository(context.env.DB);
  const zones = await projectCacheZones(context, target);
  if (zones.length === 0) {
    await repository.updateCacheRuleSync(
      target.projectId,
      null,
      'Attach a custom domain to sync these rules. Cache Rules apply to proxied zone traffic, not workers.dev subdomains.',
    );
    return;
  }
  const client = cloudflareClient(context);
  const managed = cacheRulesetRulesFor(rules);
  const failures: string[] = [];
  for (const zone of zones) {
    try {
      const existing = await client.listZoneCacheRules(zone.zoneId);
      await client.setZoneCacheRules(
        zone.zoneId,
        mergeZoneCacheRules(existing?.rules ?? [], managed),
      );
    } catch (error) {
      failures.push(`${zone.zoneName}: ${error instanceof Error ? error.message : 'sync failed'}`);
    }
  }
  if (failures.length > 0) {
    const message = failures.join('; ').slice(0, 500);
    await repository.updateCacheRuleSync(target.projectId, null, message);
    throw new AppError(
      502,
      'CACHE_RULE_SYNC_FAILED',
      'Some Cloudflare zones rejected the cache rules.',
      {
        zones: failures,
      },
    );
  }
  await repository.updateCacheRuleSync(target.projectId, new Date().toISOString(), null);
}

async function revalidateProjectCache(
  context: Context<AppEnv>,
  target: DeploymentTarget,
  paths: string[],
): Promise<CacheRevalidationHint[]> {
  const repository = new Repository(context.env.DB);
  const settings = await repository.getCacheSettings(target.projectId);
  if (!settings.revalidationNamespaceResourceId) {
    throw new AppError(
      409,
      'REVALIDATION_NAMESPACE_REQUIRED',
      'Choose a KV namespace before revalidating routes.',
    );
  }
  const resources = await repository.listManagedResources();
  const namespace = resources.find(
    (resource) =>
      resource.id === settings.revalidationNamespaceResourceId &&
      resource.kind === 'kv' &&
      resource.projectId === target.projectId,
  );
  if (!namespace) {
    throw new AppError(
      409,
      'REVALIDATION_NAMESPACE_INVALID',
      'The selected revalidation namespace is no longer available.',
    );
  }
  const client = cloudflareClient(context);
  const now = new Date().toISOString();
  await client.writeKvValue(
    namespace.cloudflareId,
    revalidationGenerationKey,
    JSON.stringify({ at: now, source: 'workerdeck' }),
  );
  for (const path of paths) {
    await client.writeKvValue(
      namespace.cloudflareId,
      revalidationKeyFor(path),
      JSON.stringify({ at: now, path }),
    );
  }
  return paths.map((path) => ({ pathExpression: path, revalidatedAt: now }));
}

async function requireBuildToken(
  context: Context<AppEnv>,
  client: CloudflareClient,
): Promise<{ id: string }> {
  const secret = context.env.CLOUDFLARE_BUILD_TOKEN;
  const cloudflareTokenId = context.env.CLOUDFLARE_BUILD_TOKEN_ID;
  if (!secret || !cloudflareTokenId) {
    throw new AppError(
      409,
      'CLOUDFLARE_BUILD_TOKEN_NOT_CONFIGURED',
      'Configure the dedicated Cloudflare build token secret and token ID before importing a connected repository.',
    );
  }
  const existing = (await client.listBuildTokens()).find(
    (token) => token.cloudflareTokenId === cloudflareTokenId,
  );
  if (existing) return existing;
  return client.createBuildToken({
    name: 'WorkerDeck application builds',
    secret,
    cloudflareTokenId,
  });
}

const zGithubInstallation = {
  safeParse(value: unknown) {
    if (
      typeof value === 'object' &&
      value !== null &&
      'installationId' in value &&
      typeof value.installationId === 'string' &&
      /^\d{1,20}$/.test(value.installationId) &&
      'state' in value &&
      typeof value.state === 'string' &&
      /^[a-f0-9]{64}$/.test(value.state)
    ) {
      return {
        success: true as const,
        data: { installationId: value.installationId, state: value.state },
      };
    }
    return { success: false as const };
  },
};

function githubAppClient(context: Context<AppEnv>): GitHubAppClient {
  const appId = context.env.GITHUB_APP_ID;
  const privateKey = context.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    throw new AppError(
      409,
      'GITHUB_APP_NOT_CONFIGURED',
      'Configure the WorkerDeck GitHub App ID and private key before listing private repositories.',
    );
  }
  return new GitHubAppClient(appId, privateKey);
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requireIdempotencyKey(context: Context<AppEnv>): string {
  const key = context.req.header('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9._:-]{16,200}$/.test(key)) {
    throw new AppError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Mutation requests require a 16-200 character Idempotency-Key header.',
    );
  }
  return key;
}

async function deploymentRequestHash(projectId: string, input: unknown): Promise<string> {
  return mutationRequestHash(projectId, input);
}

async function mutationRequestHash(scope: string, input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ scope, input }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
