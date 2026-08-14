import type { Framework } from '@workerdeck/contracts';

export interface CloudflareAccount {
  id: string;
  name: string;
}

export interface WorkerScript {
  id: string;
  tag: string;
  createdOn: string;
  modifiedOn: string;
  lastDeployedFrom: string;
}

export interface BuildTrigger {
  id: string;
  name: string;
  workerTag: string;
  buildCommand: string | null;
  deployCommand: string | null;
  branchIncludes: string[];
  branchExcludes: string[];
}

export interface UpdateBuildTriggerInput {
  name?: string;
  buildCommand?: string;
  deployCommand?: string;
  rootDirectory?: string;
  branchIncludes?: string[];
  branchExcludes?: string[];
}

export interface RepositoryConnection {
  id: string;
  provider: 'github' | 'gitlab' | 'gitlab_internal';
  providerAccountId: string;
  providerAccountName: string;
  repositoryId: string;
  repositoryName: string;
}

export interface BuildToken {
  id: string;
  name: string;
  cloudflareTokenId: string | null;
  ownerType: string | null;
}

export interface CreateBuildTriggerInput {
  workerTag: string;
  repositoryConnectionId: string;
  buildTokenId: string;
  name: string;
  buildCommand: string;
  deployCommand: string;
  rootDirectory: string;
  branchIncludes: string[];
  branchExcludes: string[];
}

export interface BuildEnvironmentVariable {
  key: string;
  isSecret: boolean;
  value: string | null;
  createdOn: string;
}

export interface WorkerSecret {
  name: string;
  type: 'secret_text' | 'secret_key';
}

export interface WorkerDomain {
  id: string;
  hostname: string;
  service: string;
  zoneId: string;
  zoneName: string;
  certificateId: string | null;
}

export interface BuildLogs {
  cursor: string | null;
  truncated: boolean;
  lines: Array<{ timestamp: number | null; message: string }>;
}

export interface WorkerBuild {
  id: string;
  status: 'queued' | 'initializing' | 'running' | 'stopped';
  outcome: 'success' | 'fail' | 'skipped' | 'cancelled' | 'terminated' | null;
  source: 'push' | 'pull_request' | 'manual' | 'api' | null;
  author: string | null;
  triggerId: string | null;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  createdOn: string;
  startedOn: string | null;
  stoppedOn: string | null;
}

export interface WorkerVersion {
  id: string;
  createdOn: string;
  hasPreview: boolean;
}

export interface VersionBuild {
  versionId: string;
  build: WorkerBuild;
}

export interface TriggerBuildInput {
  branch?: string;
  commitSha?: string;
}

export interface ProvisionedResource {
  id: string;
  name: string;
}

export interface HyperdriveOrigin {
  database: string;
  host: string;
  password: string;
  port: number;
  scheme: 'postgres' | 'postgresql' | 'mysql';
  user: string;
}

export interface VectorizeIndexConfig {
  dimensions: number;
  metric: 'cosine' | 'euclidean' | 'dotproduct';
}

export interface DurableObjectNamespace {
  id: string;
  name: string;
  className: string;
  scriptName: string;
}

export interface WorkerAnalyticsRow {
  timestamp: string;
  workerName: string;
  status: string;
  requests: number;
  errors: number;
  subrequests: number;
  cpuTimeP50: number | null;
  cpuTimeP99: number | null;
}

export interface WebAnalyticsPageViewRow {
  hostname: string;
  path: string;
  pageViews: number;
  visits: number;
}

export interface WebAnalyticsVitalsRow {
  hostname: string;
  lcpP75: number | null;
  inpP75: number | null;
  clsP75: number | null;
  fcpP75: number | null;
  ttfbP75: number | null;
}

export interface WebAnalyticsRows {
  pageViews: WebAnalyticsPageViewRow[];
  vitals: WebAnalyticsVitalsRow[];
}

export interface CloudflareZoneCacheRuleset {
  id: string;
  rules: Array<Record<string, unknown>>;
}

export interface CloudflareAccessGroup {
  id: string;
  name: string;
}

export interface CloudflareEmailRoutingAddress {
  id: string;
  email: string;
  verified: boolean;
  createdAt: string | null;
}

export interface CloudflareEmailRoutingRule {
  id: string;
  matcherEmail: string;
  destinationEmail: string;
  enabled: boolean;
  name: string | null;
}

export interface CloudflareEmailRoutingStatus {
  enabled: boolean;
  status: string;
  domain: string | null;
}

export interface CloudflareEmailRoutingCatchAll {
  enabled: boolean;
  destinationEmail: string | null;
}

export interface BuildAccountLimits {
  limitReached: boolean | null;
  refreshesAt: string | null;
}

export interface WorkerDeployment {
  id: string;
  createdOn: string;
  source: string;
  versions: Array<{ percentage: number; versionId: string }>;
}

export interface BuildTriggerInput {
  workerTag: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  productionBranch: string;
  buildCommand: string;
  deployCommand: string;
  rootDirectory?: string;
}

export interface FrameworkDetectionInput {
  packageJson?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  files: string[];
}

export interface FrameworkDetection {
  framework: Framework;
  displayName: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  buildCommand: string;
  outputDirectory: string | null;
  runtime: 'worker' | 'static';
  deployCommand: string;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'none';
  ready: boolean;
  warnings: string[];
}
