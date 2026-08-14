import { z } from 'zod';

export const identifierSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers, and hyphens.');

export const isoDateSchema = z.iso.datetime({ offset: true });

export const projectStatusSchema = z.enum(['active', 'paused', 'error']);
export const deploymentStatusSchema = z.enum([
  'queued',
  'building',
  'deploying',
  'ready',
  'failed',
  'cancelled',
  'rolled_back',
]);
export const environmentKindSchema = z.enum(['production', 'preview', 'development']);
export const frameworkSchema = z.enum([
  'static',
  'vite',
  'hono',
  'astro',
  'next',
  'sveltekit',
  'remix',
  'nuxt',
  'qwik',
  'nitro',
  'react-router',
  'analog',
  'docusaurus',
  'vitepress',
  'gatsby',
  'python',
  'unknown',
]);
export const resourceKindSchema = z.enum([
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
]);

export const resourceStatusSchema = z.enum(['active', 'detaching', 'adopted']);

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export const workspaceViewerRoleSchema = z.enum(['owner', 'admin', 'member', 'none']);

export const projectSchema = z.object({
  id: z.uuid(),
  slug: identifierSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(300).nullable(),
  repositoryUrl: z.url().nullable(),
  repositoryOwner: z.string().max(100).nullable(),
  repositoryName: z.string().max(100).nullable(),
  productionBranch: z.string().min(1).max(255),
  framework: frameworkSchema,
  outputDirectory: z.string().max(255).nullable(),
  status: projectStatusSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const environmentSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string().min(1).max(100),
  slug: identifierSchema,
  kind: environmentKindSchema,
  workerName: identifierSchema.nullable(),
  url: z.url().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const deploymentSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  environmentId: z.uuid(),
  status: deploymentStatusSchema,
  gitCommitSha: z.string().max(64).nullable(),
  gitCommitMessage: z.string().max(500).nullable(),
  gitBranch: z.string().max(255).nullable(),
  buildId: z.string().max(255).nullable(),
  workerVersionId: z.string().max(255).nullable(),
  previewUrl: z.url().nullable().default(null),
  triggeredBy: z.string().max(255),
  startedAt: isoDateSchema.nullable(),
  finishedAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
});

export const managedResourceSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  environmentId: z.uuid().nullable(),
  kind: resourceKindSchema,
  cloudflareId: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  ownershipTag: z.string().min(1).max(255),
  status: resourceStatusSchema,
  createdAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
});

export const deploymentStageSchema = z.object({
  key: z.enum(['source', 'build', 'version', 'traffic']),
  label: z.string(),
  status: z.enum(['waiting', 'running', 'complete', 'failed']),
  detail: z.string().nullable(),
});

export const dashboardSummarySchema = z.object({
  projects: z.array(projectSchema),
  deployments: z.array(deploymentSchema),
  environments: z.array(environmentSchema),
  domains: z.array(
    z.object({
      id: z.uuid(),
      cloudflareId: z.string().min(1).max(255),
      hostname: z.string().min(1).max(253),
      projectId: z.uuid().nullable(),
      environmentId: z.uuid().nullable(),
      environmentKind: environmentKindSchema.nullable(),
      certificateId: z.string().nullable(),
      source: z.enum(['managed', 'synced']),
      status: resourceStatusSchema,
      providerError: z.string().max(1000).nullable(),
    }),
  ),
  resourceCounts: z.record(resourceKindSchema, z.number().int().nonnegative()),
  account: z.object({
    id: z.string().nullable(),
    name: z.string(),
    userEmail: z.string().email().nullable(),
    plan: z.enum(['free', 'paid', 'unknown']),
    connected: z.boolean(),
  }),
  viewer: z.object({
    email: z.string().email().nullable(),
    role: workspaceViewerRoleSchema,
  }),
  sync: z
    .object({
      status: z.enum(['ok', 'degraded', 'disconnected']),
      message: z.string().max(500).nullable(),
      checkedAt: isoDateSchema.nullable(),
      failures: z.array(
        z.object({
          projectId: z.uuid(),
          message: z.string().max(500),
        }),
      ),
    })
    .nullable(),
});

export const createProjectInputSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: identifierSchema,
    description: z.string().trim().max(300).optional(),
    repositoryUrl: z
      .url()
      .refine((url) => new URL(url).protocol === 'https:', 'Repository URL must use HTTPS.'),
    repositoryProvider: z.literal('github').optional(),
    repositoryProviderAccountId: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional(),
    repositoryProviderAccountName: z.string().trim().min(1).max(100).optional(),
    repositoryId: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional(),
    productionBranch: z.string().trim().min(1).max(255).default('main'),
    framework: frameworkSchema.default('unknown'),
    outputDirectory: z
      .string()
      .trim()
      .max(255)
      .refine(
        (value) => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) && !value.includes('..'),
        'Output directory must use a safe relative path like "dist" or "out".',
      )
      .nullable()
      .default(null),
    rootDirectory: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine(
        (value) => !value.includes('..') && !value.includes('\\') && !value.includes('\0'),
        'Root directory cannot traverse outside the repository.',
      )
      .default('/'),
    buildCommand: z.string().trim().min(1).max(500).default('npm run build'),
    deployCommand: z.string().trim().min(1).max(500).default('npx wrangler deploy'),
    adoptExistingWorker: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    if (!input.repositoryProvider) return;
    for (const key of [
      'repositoryProviderAccountId',
      'repositoryProviderAccountName',
      'repositoryId',
    ] as const) {
      if (!input[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Repository provider metadata is required for connected imports.',
        });
      }
    }
  });

export const createDeploymentInputSchema = z.object({
  environmentId: z.uuid(),
  branch: z.string().trim().min(1).max(255).optional(),
  commitSha: z.string().trim().min(7).max(64).optional(),
});

const namedResourceInputSchema = z.object({
  projectId: z.uuid(),
  environmentId: z.uuid(),
  kind: z.enum(['d1', 'kv', 'r2', 'queue']),
  name: identifierSchema,
});

const hyperdriveResourceInputSchema = z.object({
  projectId: z.uuid(),
  environmentId: z.uuid(),
  kind: z.literal('hyperdrive'),
  name: identifierSchema,
  origin: z.object({
    database: z.string().trim().min(1).max(255),
    host: z.string().trim().min(1).max(255),
    port: z.number().int().min(1).max(65535),
    scheme: z.enum(['postgres', 'postgresql', 'mysql']),
    user: z.string().trim().min(1).max(255),
    password: z.string().min(1).max(1024),
  }),
});

const vectorizeResourceInputSchema = z.object({
  projectId: z.uuid(),
  environmentId: z.uuid(),
  kind: z.literal('vectorize'),
  name: identifierSchema,
  dimensions: z.number().int().min(1).max(1536),
  metric: z.enum(['cosine', 'euclidean', 'dotproduct']),
});

const aiGatewayResourceInputSchema = z.object({
  projectId: z.uuid(),
  environmentId: z.uuid(),
  kind: z.literal('ai_gateway'),
  name: identifierSchema,
  cacheTtl: z.number().int().min(0).max(86_400).default(0),
  collectLogs: z.boolean().default(true),
});

const workflowResourceInputSchema = z.object({
  projectId: z.uuid(),
  environmentId: z.uuid(),
  kind: z.literal('workflow'),
  name: identifierSchema,
  className: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use a valid class identifier.'),
  scriptName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
      'Use letters, numbers, dots, slashes, and hyphens for the Worker script name.',
    ),
});

const durableObjectResourceInputSchema = z.object({
  projectId: z.uuid(),
  environmentId: z.uuid(),
  kind: z.literal('durable_object'),
  name: z.string().trim().min(1).max(255),
  cloudflareId: z.string().min(1).max(255),
});

export const createResourceInputSchema = z.discriminatedUnion('kind', [
  namedResourceInputSchema,
  hyperdriveResourceInputSchema,
  vectorizeResourceInputSchema,
  aiGatewayResourceInputSchema,
  workflowResourceInputSchema,
  durableObjectResourceInputSchema,
]);

export const domainSchema = z.object({
  id: z.string().min(1).max(255),
  hostname: z.string().min(1).max(253),
  service: identifierSchema,
  zoneId: z.string().min(1).max(64),
  zoneName: z.string().min(1).max(253),
  certificateId: z.string().nullable(),
});

export const attachDomainInputSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(253)
    .regex(
      /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      'Enter a fully qualified hostname.',
    ),
});

export const rollbackDeploymentInputSchema = z.object({
  targetDeploymentId: z.uuid(),
  confirmation: z.literal('ROLLBACK'),
});

export const setTrafficInputSchema = z
  .object({
    versions: z
      .array(
        z.object({
          versionId: z.string().min(1).max(255),
          percentage: z.number().int().min(0).max(100),
        }),
      )
      .min(1)
      .max(4),
    message: z.string().trim().max(500).optional(),
  })
  .superRefine((input, context) => {
    const total = input.versions.reduce((sum, version) => sum + version.percentage, 0);
    if (total !== 100) {
      context.addIssue({
        code: 'custom',
        path: ['versions'],
        message: 'Traffic percentages must total 100.',
      });
    }
  });

export const cronScheduleSchema = z.object({
  cron: z.string().trim().min(3).max(100),
  createdOn: isoDateSchema.nullable(),
  modifiedOn: isoDateSchema.nullable(),
});

export const setCronSchedulesInputSchema = z.object({
  schedules: z
    .array(z.string().trim().min(3).max(100))
    .max(5)
    .transform((schedules) => [...new Set(schedules)]),
});

export const environmentVariableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, numbers, and underscores.');

export const environmentVariableTargetSchema = z.enum(['build', 'runtime_secret']);

export const environmentVariableSchema = z.object({
  key: environmentVariableKeySchema,
  target: environmentVariableTargetSchema,
  secret: z.boolean(),
  value: z.string().nullable(),
  createdAt: isoDateSchema.nullable(),
});

export const environmentVariablesSchema = z.object({
  environmentId: z.uuid(),
  workerName: identifierSchema,
  buildConnected: z.boolean(),
  runtimeConnected: z.boolean(),
  variables: z.array(environmentVariableSchema),
});

export const upsertEnvironmentVariableInputSchema = z
  .object({
    target: environmentVariableTargetSchema,
    secret: z.boolean(),
    value: z.string().min(1).max(10_000),
  })
  .superRefine((input, context) => {
    if (input.target === 'runtime_secret' && !input.secret) {
      context.addIssue({
        code: 'custom',
        message: 'Runtime values managed by WorkerDeck must be secrets.',
        path: ['secret'],
      });
    }
  });

export const gitInstallationSchema = z.object({
  id: z.string(),
  accountLogin: z.string(),
  accountType: z.string(),
});

export const gitHubConnectionSchema = z.object({
  configured: z.boolean(),
  appSlug: z.string().nullable(),
  installUrl: z.url().nullable(),
  installations: z.array(gitInstallationSchema),
});

export const gitRepositorySchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  private: z.boolean(),
  url: z.url(),
  defaultBranch: z.string(),
  language: z.string().nullable(),
  pushedAt: z.string().nullable(),
});

export const repositoryInspectionSchema = z.object({
  repositoryId: z.string(),
  framework: frameworkSchema,
  displayName: z.string().min(1).max(80),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.array(z.string()),
  rootDirectory: z.string(),
  buildCommand: z.string(),
  deployCommand: z.string(),
  outputDirectory: z.string().nullable(),
  runtime: z.enum(['worker', 'static']),
  packageManager: z.enum(['npm', 'pnpm', 'yarn', 'bun', 'none']),
  ready: z.boolean(),
  warnings: z.array(z.string()),
});

export const buildLogSchema = z.object({
  timestamp: z.number().nullable(),
  message: z.string(),
});

export const buildLogsSchema = z.object({
  buildId: z.string(),
  cursor: z.string().nullable(),
  truncated: z.boolean(),
  lines: z.array(buildLogSchema),
  diagnosis: z
    .object({
      code: z.string().min(1).max(64),
      title: z.string().min(1).max(300),
      remediation: z.string().min(1).max(1000),
    })
    .nullable()
    .optional(),
});

export const workerAnalyticsPointSchema = z.object({
  timestamp: isoDateSchema,
  requests: z.number().nonnegative(),
  errors: z.number().nonnegative(),
  subrequests: z.number().nonnegative(),
  cpuTimeP99: z.number().nonnegative().nullable(),
});

export const workerAnalyticsProjectSchema = z.object({
  workerName: identifierSchema,
  requests: z.number().nonnegative(),
  errors: z.number().nonnegative(),
  subrequests: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  cpuTimeP50: z.number().nonnegative().nullable(),
  cpuTimeP99: z.number().nonnegative().nullable(),
  points: z.array(workerAnalyticsPointSchema),
});

export const workerAnalyticsSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  sampled: z.literal(true),
  requests: z.number().nonnegative(),
  errors: z.number().nonnegative(),
  subrequests: z.number().nonnegative(),
  errorRate: z.number().min(0).max(1),
  cpuTimeP50: z.number().nonnegative().nullable(),
  cpuTimeP99: z.number().nonnegative().nullable(),
  projects: z.array(workerAnalyticsProjectSchema),
  points: z.array(workerAnalyticsPointSchema),
});

export const webVitalsSchema = z.object({
  lcpP75: z.number().nonnegative().nullable(),
  inpP75: z.number().nonnegative().nullable(),
  clsP75: z.number().nonnegative().nullable(),
  fcpP75: z.number().nonnegative().nullable(),
  ttfbP75: z.number().nonnegative().nullable(),
});

export const webAnalyticsTopPathSchema = z.object({
  path: z.string().min(1).max(2048),
  pageViews: z.number().nonnegative(),
  visits: z.number().nonnegative(),
});

export const webAnalyticsSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  sampled: z.literal(true),
  hostnames: z.array(z.string().min(1).max(253)),
  visits: z.number().nonnegative(),
  pageViews: z.number().nonnegative(),
  vitals: webVitalsSchema,
  topPaths: z.array(webAnalyticsTopPathSchema),
});

export const cachePathPatternSchema = z
  .string()
  .min(2)
  .max(255)
  .regex(
    /^\/[A-Za-z0-9\-_.*]{1,254}$/,
    'Use a URL path starting with / containing letters, numbers, dashes, dots, or a trailing *.',
  );

export const cacheRuleSchema = z.object({
  id: z.uuid(),
  pathExpression: cachePathPatternSchema,
  edgeTtlSeconds: z.number().int().min(0).max(2_592_000),
  browserTtlSeconds: z.number().int().min(0).max(2_592_000).nullable(),
  enabled: z.boolean(),
  syncedAt: isoDateSchema.nullable(),
  syncError: z.string().max(500).nullable(),
});

export const setCacheRulesInputSchema = z.object({
  rules: z
    .array(
      z.object({
        id: z.uuid().optional(),
        pathExpression: cachePathPatternSchema,
        edgeTtlSeconds: z.number().int().min(0).max(2_592_000),
        browserTtlSeconds: z.number().int().min(0).max(2_592_000).nullable(),
        enabled: z.boolean(),
      }),
    )
    .max(25),
});

export const cacheSettingsInputSchema = z.object({
  revalidationNamespaceResourceId: z.uuid().nullable(),
});

export const purgeCacheInputSchema = z.object({
  scope: z.literal('all'),
});

export const revalidateCacheInputSchema = z.object({
  paths: z.array(cachePathPatternSchema).min(1).max(25),
});

export const cacheZoneSchema = z.object({
  zoneId: z.string().min(1).max(64),
  zoneName: z.string().min(1).max(253),
  hostnames: z.array(z.string().min(1).max(253)),
});

export const cacheRevalidationHintSchema = z.object({
  pathExpression: cachePathPatternSchema,
  revalidatedAt: isoDateSchema.nullable(),
});

export const cacheRevalidationSchema = z.object({
  namespaceResourceId: z.uuid().nullable(),
  namespaceName: z.string().min(1).max(255).nullable(),
  availableNamespaces: z.array(
    z.object({ resourceId: z.uuid(), name: z.string().min(1).max(255) }),
  ),
  hints: z.array(cacheRevalidationHintSchema),
});

export const projectCacheSchema = z.object({
  rules: z.array(cacheRuleSchema),
  zones: z.array(cacheZoneSchema),
  revalidation: cacheRevalidationSchema,
});

export const recoveryResourceSchema = z.object({
  resourceId: z.uuid(),
  databaseId: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  status: z.enum(['verified', 'unavailable']),
  currentBookmark: z.string().min(1).nullable(),
  recoveryBookmark: z.string().min(1).nullable(),
  recoveryTimestamp: isoDateSchema,
  verifiedAt: isoDateSchema,
  reason: z.enum(['not_supported', 'permission_denied', 'provider_unavailable']).nullable(),
});

export const recoveryPostureSchema = z.object({
  destructiveRestore: z.literal(true),
  cloneRestoreAvailable: z.literal(false),
  retention: z.literal('7 days on Free; 30 days on Paid'),
  resources: z.array(recoveryResourceSchema),
});

export const usageSummarySchema = z.object({
  analytics: workerAnalyticsSchema,
  builds: z.object({
    limitReached: z.boolean().nullable(),
    refreshesAt: isoDateSchema.nullable(),
  }),
});

export const workspaceMemberSchema = z.object({
  id: z.uuid(),
  email: z.string().email(),
  role: workspaceRoleSchema,
  status: z.enum(['active', 'removed']),
  invitedBy: z.string().max(255).nullable(),
  createdAt: isoDateSchema,
});

export const inviteMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: workspaceRoleSchema,
});

export const updateMemberInputSchema = z.object({
  role: workspaceRoleSchema,
});

export const accessGroupSchema = z.object({
  role: workspaceRoleSchema,
  name: z.string().min(1).max(255),
  cloudflareId: z.string().min(1).max(255).nullable(),
  syncedAt: isoDateSchema.nullable(),
  syncError: z.string().max(500).nullable(),
});

export const accessTeamSchema = z.object({
  members: z.array(workspaceMemberSchema),
  groups: z.array(accessGroupSchema),
  viewer: z.object({
    email: z.string().email().nullable(),
    role: workspaceViewerRoleSchema,
  }),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});

export type Project = z.infer<typeof projectSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type Deployment = z.infer<typeof deploymentSchema>;
export type ManagedResource = z.infer<typeof managedResourceSchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type WorkspaceViewerRole = z.infer<typeof workspaceViewerRoleSchema>;
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberInputSchema>;
export type AccessGroup = z.infer<typeof accessGroupSchema>;
export type AccessTeam = z.infer<typeof accessTeamSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type CreateDeploymentInput = z.infer<typeof createDeploymentInputSchema>;
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;
export type WorkerDomain = z.infer<typeof domainSchema>;
export type AttachDomainInput = z.infer<typeof attachDomainInputSchema>;
export type RollbackDeploymentInput = z.infer<typeof rollbackDeploymentInputSchema>;
export type SetTrafficInput = z.infer<typeof setTrafficInputSchema>;
export type CronSchedule = z.infer<typeof cronScheduleSchema>;
export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;
export type EnvironmentVariables = z.infer<typeof environmentVariablesSchema>;
export type EnvironmentVariableTarget = z.infer<typeof environmentVariableTargetSchema>;
export type UpsertEnvironmentVariableInput = z.infer<typeof upsertEnvironmentVariableInputSchema>;
export type GitInstallation = z.infer<typeof gitInstallationSchema>;
export type GitHubConnection = z.infer<typeof gitHubConnectionSchema>;
export type GitRepository = z.infer<typeof gitRepositorySchema>;
export type RepositoryInspection = z.infer<typeof repositoryInspectionSchema>;
export type BuildLogs = z.infer<typeof buildLogsSchema>;
export type WorkerAnalyticsPoint = z.infer<typeof workerAnalyticsPointSchema>;
export type WorkerAnalyticsProject = z.infer<typeof workerAnalyticsProjectSchema>;
export type WorkerAnalytics = z.infer<typeof workerAnalyticsSchema>;
export type WebVitals = z.infer<typeof webVitalsSchema>;
export type WebAnalyticsTopPath = z.infer<typeof webAnalyticsTopPathSchema>;
export type WebAnalytics = z.infer<typeof webAnalyticsSchema>;
export type CacheRule = z.infer<typeof cacheRuleSchema>;
export type SetCacheRulesInput = z.infer<typeof setCacheRulesInputSchema>;
export type CacheSettingsInput = z.infer<typeof cacheSettingsInputSchema>;
export type PurgeCacheInput = z.infer<typeof purgeCacheInputSchema>;
export type RevalidateCacheInput = z.infer<typeof revalidateCacheInputSchema>;
export type CacheZone = z.infer<typeof cacheZoneSchema>;
export type CacheRevalidationHint = z.infer<typeof cacheRevalidationHintSchema>;
export type CacheRevalidation = z.infer<typeof cacheRevalidationSchema>;
export type ProjectCache = z.infer<typeof projectCacheSchema>;
export type RecoveryResource = z.infer<typeof recoveryResourceSchema>;
export type RecoveryPosture = z.infer<typeof recoveryPostureSchema>;
export type UsageSummary = z.infer<typeof usageSummarySchema>;
export type DeploymentStage = z.infer<typeof deploymentStageSchema>;
export type Framework = z.infer<typeof frameworkSchema>;
export type ResourceKind = z.infer<typeof resourceKindSchema>;
export type ResourceStatus = z.infer<typeof resourceStatusSchema>;

export interface ApiSuccess<T> {
  data: T;
  requestId: string;
}
