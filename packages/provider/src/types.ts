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
  branchIncludes: string[];
  branchExcludes: string[];
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
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  createdOn: string;
  startedOn: string | null;
  stoppedOn: string | null;
}

export interface TriggerBuildInput {
  branch?: string;
  commitSha?: string;
}

export interface ProvisionedResource {
  id: string;
  name: string;
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
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  buildCommand: string;
  outputDirectory: string | null;
  runtime: 'worker' | 'static';
}
