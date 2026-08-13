import {
  deploymentSchema,
  domainSchema,
  managedResourceSchema,
  projectSchema,
  type CreateDeploymentInput,
  type CreateProjectInput,
  type DashboardSummary,
  type Deployment,
  type Environment,
  type Project,
  type ManagedResource,
  type ResourceKind,
  type WorkerDomain,
} from '@workerdeck/contracts';
import type { WorkerBuild } from '@workerdeck/provider';
import { AppError } from './errors';
import { normalizeNullableStorageTimestamp, normalizeStorageTimestamp } from './timestamps';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  repository_url: string | null;
  repository_owner: string | null;
  repository_name: string | null;
  repository_key: string | null;
  production_branch: string;
  framework: Project['framework'];
  status: Project['status'];
  created_at: string;
  updated_at: string;
}

interface EnvironmentRow {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  kind: Environment['kind'];
  worker_name: string | null;
  worker_tag: string | null;
  build_trigger_id: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeploymentTarget {
  projectId: string;
  environmentId: string;
  environmentKind: Environment['kind'];
  productionBranch: string;
  workerName: string;
  workerTag: string | null;
  buildTriggerId: string | null;
}

export interface BuildSyncTarget {
  projectId: string;
  framework: Project['framework'];
  productionBranch: string;
  workerName: string;
  workerTag: string;
  productionEnvironmentId: string;
  previewEnvironmentId: string;
  productionTriggerId: string | null;
  previewTriggerId: string | null;
}

export interface ProjectDeletionPlan {
  project: Project;
  workerName: string | null;
  buildTriggerIds: string[];
  resources: ManagedResource[];
}

interface DeploymentRow {
  id: string;
  project_id: string;
  environment_id: string;
  status: Deployment['status'];
  git_commit_sha: string | null;
  git_commit_message: string | null;
  git_branch: string | null;
  build_id: string | null;
  worker_version_id: string | null;
  triggered_by: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

interface ManagedResourceRow {
  id: string;
  project_id: string | null;
  environment_id: string | null;
  kind: ResourceKind;
  cloudflare_id: string;
  name: string;
  ownership_tag: string;
  created_at: string;
  deleted_at: string | null;
}

interface GitInstallationRow {
  id: string;
  provider: 'github';
  provider_installation_id: string;
  account_login: string;
  account_type: string;
  created_at: string;
  updated_at: string;
}

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  repositoryUrl: row.repository_url,
  repositoryOwner: row.repository_owner,
  repositoryName: row.repository_name,
  productionBranch: row.production_branch,
  framework: row.framework,
  status: row.status,
  createdAt: normalizeStorageTimestamp(row.created_at),
  updatedAt: normalizeStorageTimestamp(row.updated_at),
});

const toEnvironment = (row: EnvironmentRow): Environment => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  slug: row.slug,
  kind: row.kind,
  workerName: row.worker_name,
  url: row.url,
  createdAt: normalizeStorageTimestamp(row.created_at),
  updatedAt: normalizeStorageTimestamp(row.updated_at),
});

const toDeployment = (row: DeploymentRow): Deployment => ({
  id: row.id,
  projectId: row.project_id,
  environmentId: row.environment_id,
  status: row.status,
  gitCommitSha: row.git_commit_sha,
  gitCommitMessage: row.git_commit_message,
  gitBranch: row.git_branch,
  buildId: row.build_id,
  workerVersionId: row.worker_version_id,
  triggeredBy: row.triggered_by,
  startedAt: normalizeNullableStorageTimestamp(row.started_at),
  finishedAt: normalizeNullableStorageTimestamp(row.finished_at),
  createdAt: normalizeStorageTimestamp(row.created_at),
});

const toManagedResource = (row: ManagedResourceRow): ManagedResource => ({
  id: row.id,
  projectId: row.project_id,
  environmentId: row.environment_id,
  kind: row.kind,
  cloudflareId: row.cloudflare_id,
  name: row.name,
  ownershipTag: row.ownership_tag,
  createdAt: normalizeStorageTimestamp(row.created_at),
  deletedAt: normalizeNullableStorageTimestamp(row.deleted_at),
});

interface CreatedProject {
  project: Project;
  initialDeployment: Deployment | null;
}

function repositoryParts(repositoryUrl: string): { owner: string | null; name: string | null } {
  const pathname = new URL(repositoryUrl).pathname.replace(/^\//, '').replace(/\.git$/, '');
  const [owner, name] = pathname.split('/');
  return { owner: owner || null, name: name || null };
}

export function canonicalRepositoryKey(repositoryUrl: string): string {
  const url = new URL(repositoryUrl);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = url.pathname
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
  return `${hostname}:${pathname}`;
}

export class Repository {
  constructor(private readonly db: D1Database) {}

  async dashboard(account: DashboardSummary['account']): Promise<DashboardSummary> {
    const [projects, environments, deployments, resourceCounts] = await Promise.all([
      this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 50').all<ProjectRow>(),
      this.db
        .prepare('SELECT * FROM environments ORDER BY updated_at DESC LIMIT 100')
        .all<EnvironmentRow>(),
      this.db
        .prepare('SELECT * FROM deployments ORDER BY created_at DESC LIMIT 30')
        .all<DeploymentRow>(),
      this.db
        .prepare(
          'SELECT kind, COUNT(*) AS count FROM managed_resources WHERE deleted_at IS NULL GROUP BY kind',
        )
        .all<{ kind: ResourceKind; count: number }>(),
    ]);

    const counts: DashboardSummary['resourceCounts'] = {
      worker: 0,
      d1: 0,
      kv: 0,
      r2: 0,
      domain: 0,
      queue: 0,
      workflow: 0,
    };
    for (const row of resourceCounts.results) counts[row.kind] = row.count;

    return {
      projects: projects.results.map(toProject),
      environments: environments.results.map(toEnvironment),
      deployments: deployments.results.map(toDeployment),
      resourceCounts: counts,
      account,
    };
  }

  async listProjects(): Promise<Project[]> {
    const result = await this.db
      .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
      .all<ProjectRow>();
    return result.results.map(toProject);
  }

  async findProjectBySlug(slug: string): Promise<Project | null> {
    const row = await this.db
      .prepare('SELECT * FROM projects WHERE slug = ?')
      .bind(slug)
      .first<ProjectRow>();
    return row ? toProject(row) : null;
  }

  async findProjectByRepository(repositoryUrl: string): Promise<Project | null> {
    const parts = repositoryParts(repositoryUrl);
    const row = await this.db
      .prepare(
        `SELECT * FROM projects
         WHERE repository_key = ?
            OR (lower(repository_owner) = lower(?) AND lower(repository_name) = lower(?))
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(canonicalRepositoryKey(repositoryUrl), parts.owner, parts.name)
      .first<ProjectRow>();
    return row ? toProject(row) : null;
  }

  async requireProject(projectId: string): Promise<Project> {
    const row = await this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .bind(projectId)
      .first<ProjectRow>();
    if (!row) throw new AppError(404, 'PROJECT_NOT_FOUND', 'The project does not exist.');
    return toProject(row);
  }

  async getProjectDeletionPlan(projectId: string): Promise<ProjectDeletionPlan> {
    const project = await this.requireProject(projectId);
    const [environments, resources, activeDeployments] = await Promise.all([
      this.db
        .prepare('SELECT * FROM environments WHERE project_id = ? ORDER BY created_at ASC')
        .bind(projectId)
        .all<EnvironmentRow>(),
      this.db
        .prepare(
          'SELECT * FROM managed_resources WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
        )
        .bind(projectId)
        .all<ManagedResourceRow>(),
      this.db
        .prepare(
          "SELECT COUNT(*) AS count FROM deployments WHERE project_id = ? AND status IN ('queued', 'building', 'deploying')",
        )
        .bind(projectId)
        .first<{ count: number }>(),
    ]);
    if (Number(activeDeployments?.count ?? 0) > 0) {
      throw new AppError(
        409,
        'PROJECT_DEPLOYMENT_ACTIVE',
        'Cancel or wait for active deployments before deleting this project.',
      );
    }
    const managedWorkerNames = new Set(
      resources.results
        .filter((resource) => resource.kind === 'worker')
        .map((resource) => resource.cloudflare_id),
    );
    const workerNames = [
      ...new Set(
        environments.results
          .map((environment) => environment.worker_name)
          .filter(
            (name): name is string => Boolean(name) && managedWorkerNames.has(name as string),
          ),
      ),
    ];
    if (workerNames.length > 1) {
      throw new AppError(
        409,
        'PROJECT_OWNERSHIP_AMBIGUOUS',
        'WorkerDeck found multiple Workers for this project and will not delete them automatically.',
      );
    }
    return {
      project,
      workerName: workerNames[0] ?? null,
      buildTriggerIds: [
        ...new Set(
          environments.results
            .map((environment) => environment.build_trigger_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ],
      resources: resources.results.map(toManagedResource),
    };
  }

  async deleteProjectRecord(
    projectId: string,
    actor: string,
    requestId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const project = await this.requireProject(projectId);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE managed_resources
           SET project_id = NULL, environment_id = NULL, deleted_at = COALESCE(deleted_at, ?)
           WHERE project_id = ?`,
        )
        .bind(now, projectId),
      this.db.prepare('DELETE FROM projects WHERE id = ?').bind(projectId),
      this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, target_type, target_id, request_id, metadata_json, created_at
          ) VALUES (?, ?, 'project.deleted', 'project', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor,
          projectId,
          requestId,
          JSON.stringify({ name: project.name, slug: project.slug, ...metadata }),
          now,
        ),
    ]);
  }

  async deleteDeploymentRecord(
    deploymentId: string,
    actor: string,
    requestId: string,
  ): Promise<void> {
    const deployment = await this.requireDeployment(deploymentId);
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare('DELETE FROM deployments WHERE id = ?').bind(deploymentId),
      this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, target_type, target_id, request_id, metadata_json, created_at
          ) VALUES (?, ?, 'deployment.deleted', 'deployment', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor,
          deploymentId,
          requestId,
          JSON.stringify({ projectId: deployment.projectId, buildId: deployment.buildId }),
          now,
        ),
    ]);
  }

  async acquireProvisioningLock(input: {
    scope: string;
    key: string;
    actor: string;
    requestId: string;
  }): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    try {
      await this.db.batch([
        this.db
          .prepare('DELETE FROM provisioning_locks WHERE expires_at <= ?')
          .bind(now.toISOString()),
        this.db
          .prepare(
            `INSERT INTO provisioning_locks (
              scope, lock_key, actor, request_id, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.scope,
            input.key,
            input.actor,
            input.requestId,
            now.toISOString(),
            expiresAt.toISOString(),
          ),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new AppError(
          409,
          'PROVISIONING_IN_PROGRESS',
          'This resource is already being provisioned. Wait for the current operation to finish.',
        );
      }
      throw error;
    }
  }

  async releaseProvisioningLock(scope: string, key: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM provisioning_locks WHERE scope = ? AND lock_key = ?')
      .bind(scope, key)
      .run();
  }

  async listManagedResources(): Promise<ManagedResource[]> {
    const result = await this.db
      .prepare('SELECT * FROM managed_resources WHERE deleted_at IS NULL ORDER BY created_at DESC')
      .all<ManagedResourceRow>();
    return result.results.map(toManagedResource);
  }

  async saveGitHubInstallation(input: {
    installationId: string;
    accountLogin: string;
    accountType: string;
    actor: string;
    requestId: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO git_installations (
            id, provider, provider_installation_id, account_login, account_type, created_at, updated_at
          ) VALUES (?, 'github', ?, ?, ?, ?, ?)
          ON CONFLICT(provider_installation_id) DO UPDATE SET
            account_login = excluded.account_login,
            account_type = excluded.account_type,
            updated_at = excluded.updated_at`,
        )
        .bind(id, input.installationId, input.accountLogin, input.accountType, now, now),
      this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, target_type, target_id, request_id, metadata_json, created_at
          ) VALUES (?, ?, 'git_installation.connected', 'git_installation', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.actor,
          input.installationId,
          input.requestId,
          JSON.stringify({ provider: 'github', accountLogin: input.accountLogin }),
          now,
        ),
    ]);
  }

  async listGitHubInstallations(): Promise<GitInstallationRow[]> {
    const result = await this.db
      .prepare("SELECT * FROM git_installations WHERE provider = 'github' ORDER BY updated_at DESC")
      .all<GitInstallationRow>();
    return result.results;
  }

  async createGitSetupState(stateHash: string, actor: string): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    await this.db.batch([
      this.db.prepare('DELETE FROM git_setup_states WHERE expires_at <= ?').bind(now.toISOString()),
      this.db
        .prepare(
          'INSERT INTO git_setup_states (state_hash, actor, expires_at, created_at) VALUES (?, ?, ?, ?)',
        )
        .bind(stateHash, actor, expiresAt.toISOString(), now.toISOString()),
    ]);
  }

  async consumeGitSetupState(stateHash: string, actor: string): Promise<void> {
    const row = await this.db
      .prepare('SELECT actor, expires_at FROM git_setup_states WHERE state_hash = ?')
      .bind(stateHash)
      .first<{ actor: string; expires_at: string }>();
    if (!row || row.actor !== actor || row.expires_at <= new Date().toISOString()) {
      throw new AppError(
        403,
        'INVALID_GITHUB_SETUP_STATE',
        'This GitHub installation session is invalid or has expired. Start the connection again.',
      );
    }
    await this.db
      .prepare('DELETE FROM git_setup_states WHERE state_hash = ?')
      .bind(stateHash)
      .run();
  }

  async recordManagedResource(input: {
    projectId: string;
    environmentId: string;
    kind: 'd1' | 'kv' | 'r2' | 'domain';
    cloudflareId: string;
    name: string;
    actor: string;
    requestId: string;
  }): Promise<ManagedResource> {
    const environment = await this.db
      .prepare('SELECT id FROM environments WHERE id = ? AND project_id = ?')
      .bind(input.environmentId, input.projectId)
      .first<{ id: string }>();
    if (!environment) {
      throw new AppError(404, 'ENVIRONMENT_NOT_FOUND', 'The selected environment does not exist.');
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const ownershipTag = `workerdeck:${input.projectId}:${input.environmentId}:${input.kind}:${id}`;
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO managed_resources (
            id, project_id, environment_id, kind, cloudflare_id, name, ownership_tag,
            configuration_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
        )
        .bind(
          id,
          input.projectId,
          input.environmentId,
          input.kind,
          input.cloudflareId,
          input.name,
          ownershipTag,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, target_type, target_id, request_id, metadata_json, created_at
          ) VALUES (?, ?, 'resource.created', 'managed_resource', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.actor,
          id,
          input.requestId,
          JSON.stringify({ kind: input.kind, name: input.name }),
          now,
        ),
    ]);
    const row = await this.db
      .prepare('SELECT * FROM managed_resources WHERE id = ?')
      .bind(id)
      .first<ManagedResourceRow>();
    if (!row) {
      throw new AppError(500, 'RESOURCE_RECORD_FAILED', 'The resource ownership record was lost.');
    }
    return toManagedResource(row);
  }

  async createProject(
    input: CreateProjectInput,
    actor: string,
    requestId: string,
    buildTarget?: {
      workerTag: string;
      buildTriggerId: string;
      previewBuildTriggerId: string;
      workerUrl: string;
    },
  ): Promise<CreatedProject> {
    const now = new Date().toISOString();
    const projectId = crypto.randomUUID();
    const environmentId = crypto.randomUUID();
    const previewEnvironmentId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const initialDeploymentId = buildTarget ? crypto.randomUUID() : null;
    const repository = repositoryParts(input.repositoryUrl);

    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO projects (
              id, slug, name, description, repository_url, repository_owner, repository_name,
              production_branch, framework, repository_key, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
          )
          .bind(
            projectId,
            input.slug,
            input.name,
            input.description ?? null,
            input.repositoryUrl,
            repository.owner,
            repository.name,
            input.productionBranch,
            input.framework,
            canonicalRepositoryKey(input.repositoryUrl),
            now,
            now,
          ),
        this.db
          .prepare(
            `INSERT INTO environments (
              id, project_id, name, slug, kind, worker_name, worker_tag, build_trigger_id, url,
              created_at, updated_at
            ) VALUES (?, ?, 'Production', 'production', 'production', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            environmentId,
            projectId,
            `workerdeck-${input.slug}`,
            buildTarget?.workerTag ?? null,
            buildTarget?.buildTriggerId ?? null,
            buildTarget?.workerUrl ?? null,
            now,
            now,
          ),
        this.db
          .prepare(
            `INSERT INTO environments (
              id, project_id, name, slug, kind, worker_name, worker_tag, build_trigger_id, url,
              created_at, updated_at
            ) VALUES (?, ?, 'Preview', 'preview', 'preview', ?, ?, ?, NULL, ?, ?)`,
          )
          .bind(
            previewEnvironmentId,
            projectId,
            `workerdeck-${input.slug}`,
            buildTarget?.workerTag ?? null,
            buildTarget?.previewBuildTriggerId ?? null,
            now,
            now,
          ),
        ...(buildTarget
          ? [
              this.db
                .prepare(
                  `INSERT INTO managed_resources (
                    id, project_id, environment_id, kind, cloudflare_id, name, ownership_tag,
                    configuration_json, created_at
                  ) VALUES (?, ?, ?, 'worker', ?, ?, ?, ?, ?)`,
                )
                .bind(
                  crypto.randomUUID(),
                  projectId,
                  environmentId,
                  `workerdeck-${input.slug}`,
                  `workerdeck-${input.slug}`,
                  `workerdeck:${projectId}:${environmentId}:worker`,
                  JSON.stringify({ managed: true, source: 'github' }),
                  now,
                ),
              this.db
                .prepare(
                  `INSERT INTO deployments (
                    id, project_id, environment_id, status, git_commit_sha, git_branch,
                    triggered_by, created_at
                  ) VALUES (?, ?, ?, 'queued', NULL, ?, ?, ?)`,
                )
                .bind(
                  initialDeploymentId,
                  projectId,
                  environmentId,
                  input.productionBranch,
                  actor,
                  now,
                ),
              this.db
                .prepare(
                  `INSERT INTO audit_events (
                    id, actor, action, target_type, target_id, request_id, metadata_json, created_at
                  ) VALUES (?, ?, 'deployment.queued', 'deployment', ?, ?, ?, ?)`,
                )
                .bind(
                  crypto.randomUUID(),
                  actor,
                  initialDeploymentId,
                  requestId,
                  JSON.stringify({ projectId, initial: true }),
                  now,
                ),
            ]
          : []),
        this.db
          .prepare(
            `INSERT INTO audit_events (
              id, actor, action, target_type, target_id, request_id, metadata_json, created_at
            ) VALUES (?, ?, 'project.created', 'project', ?, ?, ?, ?)`,
          )
          .bind(auditId, actor, projectId, requestId, JSON.stringify({ slug: input.slug }), now),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        const duplicateRepository = await this.findProjectByRepository(input.repositoryUrl);
        if (duplicateRepository) {
          throw new AppError(
            409,
            'PROJECT_REPOSITORY_EXISTS',
            `The repository is already connected to ${duplicateRepository.name}.`,
          );
        }
        throw new AppError(409, 'PROJECT_SLUG_EXISTS', 'A project already uses this slug.');
      }
      throw error;
    }

    const row = await this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .bind(projectId)
      .first<ProjectRow>();
    if (!row)
      throw new AppError(
        500,
        'PROJECT_CREATE_FAILED',
        'The project could not be read after creation.',
      );
    const initialDeployment = initialDeploymentId
      ? await this.db
          .prepare('SELECT * FROM deployments WHERE id = ?')
          .bind(initialDeploymentId)
          .first<DeploymentRow>()
      : null;
    return {
      project: toProject(row),
      initialDeployment: initialDeployment ? toDeployment(initialDeployment) : null,
    };
  }

  async createDeployment(
    projectId: string,
    input: CreateDeploymentInput,
    actor: string,
    requestId: string,
  ): Promise<Deployment> {
    const environment = await this.db
      .prepare('SELECT * FROM environments WHERE id = ? AND project_id = ?')
      .bind(input.environmentId, projectId)
      .first<EnvironmentRow>();
    if (!environment) {
      throw new AppError(404, 'ENVIRONMENT_NOT_FOUND', 'The selected environment does not exist.');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO deployments (
              id, project_id, environment_id, status, git_commit_sha, git_branch, triggered_by, created_at
            ) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)`,
          )
          .bind(
            id,
            projectId,
            input.environmentId,
            input.commitSha ?? null,
            input.branch ?? null,
            actor,
            now,
          ),
        this.db
          .prepare(
            `INSERT INTO audit_events (
              id, actor, action, target_type, target_id, request_id, metadata_json, created_at
            ) VALUES (?, ?, 'deployment.queued', 'deployment', ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), actor, id, requestId, JSON.stringify({ projectId }), now),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new AppError(
          409,
          'DEPLOYMENT_ALREADY_ACTIVE',
          'Wait for the active deployment in this environment to finish.',
        );
      }
      throw error;
    }

    const row = await this.db
      .prepare('SELECT * FROM deployments WHERE id = ?')
      .bind(id)
      .first<DeploymentRow>();
    if (!row)
      throw new AppError(500, 'DEPLOYMENT_CREATE_FAILED', 'The deployment could not be queued.');
    return toDeployment(row);
  }

  async getDeploymentTarget(projectId: string, environmentId: string): Promise<DeploymentTarget> {
    const row = await this.db
      .prepare(
        `SELECT
          p.id AS project_id,
          p.framework,
          p.production_branch,
          e.id AS environment_id,
          e.kind AS environment_kind,
          e.worker_name,
          e.worker_tag,
          e.build_trigger_id
        FROM projects p
        JOIN environments e ON e.project_id = p.id
        WHERE p.id = ? AND e.id = ?`,
      )
      .bind(projectId, environmentId)
      .first<{
        project_id: string;
        environment_id: string;
        environment_kind: Environment['kind'];
        production_branch: string;
        worker_name: string | null;
        worker_tag: string | null;
        build_trigger_id: string | null;
      }>();
    if (!row) {
      throw new AppError(404, 'ENVIRONMENT_NOT_FOUND', 'The selected environment does not exist.');
    }
    if (!row.worker_name) {
      throw new AppError(
        409,
        'BUILD_TARGET_NOT_CONFIGURED',
        'Connect this environment to a Cloudflare Worker before deploying.',
      );
    }
    return {
      projectId: row.project_id,
      environmentId: row.environment_id,
      environmentKind: row.environment_kind,
      productionBranch: row.production_branch,
      workerName: row.worker_name,
      workerTag: row.worker_tag,
      buildTriggerId: row.build_trigger_id,
    };
  }

  async nextBuildSyncTargets(limit = 10): Promise<BuildSyncTarget[]> {
    const boundedLimit = Math.max(1, Math.min(limit, 15));
    const countRow = await this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM environments WHERE kind = 'production' AND worker_tag IS NOT NULL",
      )
      .first<{ count: number }>();
    const count = Number(countRow?.count ?? 0);
    if (count === 0) return [];
    const cursorRow = await this.db
      .prepare("SELECT value FROM settings WHERE key = 'build_sync_cursor'")
      .first<{ value: string }>();
    const requestedOffset = Number.parseInt(cursorRow?.value ?? '0', 10);
    const offset =
      Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset % count : 0;
    const result = await this.db
      .prepare(
        `SELECT
          p.id AS project_id,
          p.framework,
          p.production_branch,
          production.worker_name,
          production.worker_tag,
          production.id AS production_environment_id,
          production.build_trigger_id AS production_trigger_id,
          preview.id AS preview_environment_id,
          preview.build_trigger_id AS preview_trigger_id
        FROM projects p
        JOIN environments production
          ON production.project_id = p.id AND production.kind = 'production'
        JOIN environments preview
          ON preview.project_id = p.id AND preview.kind = 'preview'
        WHERE production.worker_name IS NOT NULL AND production.worker_tag IS NOT NULL
        ORDER BY p.created_at ASC
        LIMIT ? OFFSET ?`,
      )
      .bind(boundedLimit, offset)
      .all<{
        project_id: string;
        framework: Project['framework'];
        production_branch: string;
        worker_name: string;
        worker_tag: string;
        production_environment_id: string;
        production_trigger_id: string | null;
        preview_environment_id: string;
        preview_trigger_id: string | null;
      }>();
    const nextOffset = (offset + Math.max(result.results.length, 1)) % count;
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('build_sync_cursor', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(String(nextOffset), now)
      .run();
    return result.results.map((row) => ({
      projectId: row.project_id,
      framework: row.framework,
      productionBranch: row.production_branch,
      workerName: row.worker_name,
      workerTag: row.worker_tag,
      productionEnvironmentId: row.production_environment_id,
      previewEnvironmentId: row.preview_environment_id,
      productionTriggerId: row.production_trigger_id,
      previewTriggerId: row.preview_trigger_id,
    }));
  }

  async recordBuildSyncHealth(input: {
    checkedAt: string;
    targetCount: number;
    failures: Array<{ projectId: string; message: string }>;
  }): Promise<void> {
    const value = JSON.stringify({
      checkedAt: input.checkedAt,
      targetCount: input.targetCount,
      failureCount: input.failures.length,
      failures: input.failures,
    });
    await this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('build_sync_health', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(value, input.checkedAt)
      .run();
  }

  async latestDeploymentForEnvironment(environmentId: string): Promise<Deployment | null> {
    const row = await this.db
      .prepare(
        'SELECT * FROM deployments WHERE environment_id = ? ORDER BY created_at DESC LIMIT 1',
      )
      .bind(environmentId)
      .first<DeploymentRow>();
    return row ? toDeployment(row) : null;
  }

  async hasBuildRepairRetry(revision: string, projectId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 AS found FROM settings WHERE key = ?')
      .bind(`build_repair_retry:${revision}:${projectId}`)
      .first<{ found: number }>();
    return row?.found === 1;
  }

  async recordBuildRepairRetry(input: {
    revision: string;
    projectId: string;
    deploymentId: string;
    outcome: 'triggered' | 'failed';
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .bind(
        `build_repair_retry:${input.revision}:${input.projectId}`,
        JSON.stringify({
          deploymentId: input.deploymentId,
          outcome: input.outcome,
          recordedAt: now,
        }),
        now,
      )
      .run();
  }

  async recordProviderBuild(input: {
    target: BuildSyncTarget;
    build: WorkerBuild;
    workerVersionId: string | null;
    actor: string;
    requestId: string;
  }): Promise<Deployment | null> {
    const existing = await this.db
      .prepare('SELECT * FROM deployments WHERE build_id = ?')
      .bind(input.build.id)
      .first<DeploymentRow>();
    if (existing) {
      return this.reconcileBuild(
        existing.id,
        input.build,
        input.workerVersionId,
        input.actor,
        input.requestId,
      );
    }
    const production = input.build.branch === input.target.productionBranch;
    const environmentId = production
      ? input.target.productionEnvironmentId
      : input.target.previewEnvironmentId;
    const terminal = input.build.status === 'stopped';
    const status: Deployment['status'] = !terminal
      ? 'building'
      : input.build.outcome === 'success'
        ? 'ready'
        : input.build.outcome === 'cancelled' || input.build.outcome === 'terminated'
          ? 'cancelled'
          : 'failed';
    const id = crypto.randomUUID();
    const createdAt = input.build.createdOn;
    const finishedAt = terminal ? (input.build.stoppedOn ?? createdAt) : null;
    const triggeredBy = input.build.author ?? `Cloudflare ${input.build.source ?? 'build'}`;
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO deployments (
              id, project_id, environment_id, status, git_commit_sha, git_commit_message,
              git_branch, build_id, worker_version_id, triggered_by, started_at, finished_at,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            input.target.projectId,
            environmentId,
            status,
            input.build.commitSha,
            input.build.commitMessage,
            input.build.branch,
            input.build.id,
            input.workerVersionId,
            triggeredBy.slice(0, 255),
            input.build.startedOn ?? createdAt,
            finishedAt,
            createdAt,
          ),
        this.db
          .prepare(
            `INSERT INTO audit_events (
              id, actor, action, target_type, target_id, request_id, metadata_json, created_at
            ) VALUES (?, ?, 'deployment.discovered', 'deployment', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            input.actor,
            id,
            input.requestId,
            JSON.stringify({
              buildId: input.build.id,
              source: input.build.source,
              environment: production ? 'production' : 'preview',
              outcome: input.build.outcome,
            }),
            new Date().toISOString(),
          ),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        const raced = await this.db
          .prepare('SELECT * FROM deployments WHERE build_id = ?')
          .bind(input.build.id)
          .first<DeploymentRow>();
        if (raced) return toDeployment(raced);
        return null;
      }
      throw error;
    }
    return this.requireDeployment(id);
  }

  async saveBuildTarget(
    environmentId: string,
    workerTag: string,
    buildTriggerId: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE environments
         SET worker_tag = ?, build_trigger_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(workerTag, buildTriggerId, now, environmentId)
      .run();
  }

  async saveEnvironmentUrl(environmentId: string, url: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE environments
         SET url = ?, updated_at = ?
         WHERE id = ? AND (url IS NULL OR url != ?)`,
      )
      .bind(url, now, environmentId, url)
      .run();
  }

  async recordEnvironmentVariableAudit(input: {
    action: 'created' | 'updated' | 'deleted';
    projectId: string;
    environmentId: string;
    key: string;
    target: 'build' | 'runtime_secret';
    secret: boolean;
    actor: string;
    requestId: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, target_type, target_id, request_id, metadata_json, created_at
        ) VALUES (?, ?, ?, 'environment', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.actor,
        `environment_variable.${input.action}`,
        input.environmentId,
        input.requestId,
        JSON.stringify({
          projectId: input.projectId,
          key: input.key,
          target: input.target,
          secret: input.secret,
        }),
        now,
      )
      .run();
  }

  async attachBuild(deploymentId: string, build: WorkerBuild): Promise<Deployment> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE deployments
         SET status = 'building', build_id = ?, started_at = ?,
             git_commit_sha = COALESCE(?, git_commit_sha),
             git_commit_message = COALESCE(?, git_commit_message),
             git_branch = COALESCE(?, git_branch)
         WHERE id = ? AND status = 'queued'`,
      )
      .bind(
        build.id,
        build.startedOn ?? now,
        build.commitSha,
        build.commitMessage,
        build.branch,
        deploymentId,
      )
      .run();
    return this.requireDeployment(deploymentId);
  }

  async failDeployment(
    deploymentId: string,
    errorCode: string,
    actor: string,
    requestId: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare("UPDATE deployments SET status = 'failed', finished_at = ? WHERE id = ?")
        .bind(now, deploymentId),
      this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, target_type, target_id, request_id, metadata_json, created_at
          ) VALUES (?, ?, 'deployment.failed', 'deployment', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor,
          deploymentId,
          requestId,
          JSON.stringify({ errorCode }),
          now,
        ),
    ]);
  }

  async reconcileBuild(
    deploymentId: string,
    build: WorkerBuild,
    workerVersionId: string | null,
    actor: string,
    requestId: string,
  ): Promise<Deployment> {
    const current = await this.requireDeployment(deploymentId);
    if (['ready', 'failed', 'cancelled', 'rolled_back'].includes(current.status)) return current;

    const terminal = build.status === 'stopped';
    const status: Deployment['status'] = !terminal
      ? 'building'
      : build.outcome === 'success'
        ? workerVersionId
          ? 'ready'
          : 'deploying'
        : build.outcome === 'cancelled' || build.outcome === 'terminated'
          ? 'cancelled'
          : 'failed';
    if (
      current.status === status &&
      (!workerVersionId || current.workerVersionId === workerVersionId)
    ) {
      return current;
    }
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE deployments
           SET status = ?, worker_version_id = COALESCE(?, worker_version_id),
               git_commit_sha = COALESCE(?, git_commit_sha),
               git_commit_message = COALESCE(?, git_commit_message),
               git_branch = COALESCE(?, git_branch),
               started_at = COALESCE(started_at, ?),
               finished_at = ?
           WHERE id = ?`,
        )
        .bind(
          status,
          workerVersionId,
          build.commitSha,
          build.commitMessage,
          build.branch,
          build.startedOn ?? now,
          terminal && status !== 'deploying' ? (build.stoppedOn ?? now) : null,
          deploymentId,
        ),
      this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, target_type, target_id, request_id, metadata_json, created_at
          ) VALUES (?, ?, ?, 'deployment', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor,
          `deployment.${status}`,
          deploymentId,
          requestId,
          JSON.stringify({ buildId: build.id, outcome: build.outcome }),
          now,
        ),
    ]);
    return this.requireDeployment(deploymentId);
  }

  async cancelDeployment(
    deploymentId: string,
    actor: string,
    requestId: string,
  ): Promise<Deployment> {
    const deployment = await this.requireDeployment(deploymentId);
    if (!['queued', 'building', 'deploying'].includes(deployment.status)) {
      throw new AppError(409, 'DEPLOYMENT_NOT_CANCELLABLE', 'This deployment is already complete.');
    }
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare("UPDATE deployments SET status = 'cancelled', finished_at = ? WHERE id = ?")
        .bind(now, deploymentId),
      this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, target_type, target_id, request_id, metadata_json, created_at
          ) VALUES (?, ?, 'deployment.cancelled', 'deployment', ?, ?, '{}', ?)`,
        )
        .bind(crypto.randomUUID(), actor, deploymentId, requestId, now),
    ]);
    return this.requireDeployment(deploymentId);
  }

  async recordRollback(target: Deployment, actor: string, requestId: string): Promise<Deployment> {
    const current = await this.db
      .prepare(
        `SELECT * FROM deployments
         WHERE environment_id = ? AND status IN ('ready', 'rolled_back')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(target.environmentId)
      .first<DeploymentRow>();
    if (current?.worker_version_id === target.workerVersionId) {
      throw new AppError(409, 'VERSION_ALREADY_ACTIVE', 'This Worker version is already active.');
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO deployments (
            id, project_id, environment_id, status, git_commit_sha, git_commit_message,
            git_branch, worker_version_id, triggered_by, started_at, finished_at, created_at
          ) VALUES (?, ?, ?, 'rolled_back', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          target.projectId,
          target.environmentId,
          target.gitCommitSha,
          `Rollback to ${target.gitCommitMessage ?? target.workerVersionId ?? 'previous version'}`,
          target.gitBranch,
          target.workerVersionId,
          actor,
          now,
          now,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, target_type, target_id, request_id, metadata_json, created_at
          ) VALUES (?, ?, 'deployment.rolled_back', 'deployment', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actor,
          id,
          requestId,
          JSON.stringify({
            targetDeploymentId: target.id,
            workerVersionId: target.workerVersionId,
          }),
          now,
        ),
    ]);
    return this.requireDeployment(id);
  }

  async requireDeployment(deploymentId: string): Promise<Deployment> {
    const row = await this.db
      .prepare('SELECT * FROM deployments WHERE id = ?')
      .bind(deploymentId)
      .first<DeploymentRow>();
    if (!row) throw new AppError(404, 'DEPLOYMENT_NOT_FOUND', 'The deployment does not exist.');
    return toDeployment(row);
  }

  async getIdempotentDeployment(
    key: string,
    actor: string,
    requestHash: string,
  ): Promise<Deployment | null> {
    const row = await this.db
      .prepare(
        `SELECT actor, request_hash, response_json, status_code, expires_at
         FROM idempotency_keys WHERE key = ?`,
      )
      .bind(key)
      .first<{
        actor: string;
        request_hash: string;
        response_json: string;
        status_code: number;
        expires_at: string;
      }>();
    if (!row || row.expires_at <= new Date().toISOString()) return null;
    if (row.actor !== actor || row.request_hash !== requestHash) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Use a new idempotency key for a different deployment request.',
      );
    }
    if (row.status_code === 102) {
      throw new AppError(
        409,
        'IDEMPOTENT_REQUEST_IN_PROGRESS',
        'This deployment request is already in progress.',
      );
    }
    return deploymentSchema.parse(JSON.parse(row.response_json));
  }

  async getIdempotentResource(
    key: string,
    actor: string,
    requestHash: string,
  ): Promise<ManagedResource | null> {
    const row = await this.db
      .prepare(
        `SELECT actor, request_hash, response_json, status_code, expires_at
         FROM idempotency_keys WHERE key = ?`,
      )
      .bind(key)
      .first<{
        actor: string;
        request_hash: string;
        response_json: string;
        status_code: number;
        expires_at: string;
      }>();
    if (!row || row.expires_at <= new Date().toISOString()) return null;
    if (row.actor !== actor || row.request_hash !== requestHash) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Use a new idempotency key for a different resource request.',
      );
    }
    if (row.status_code === 102) {
      throw new AppError(
        409,
        'IDEMPOTENT_REQUEST_IN_PROGRESS',
        'This resource request is already in progress.',
      );
    }
    return managedResourceSchema.parse(JSON.parse(row.response_json));
  }

  async getIdempotentProject(
    key: string,
    actor: string,
    requestHash: string,
  ): Promise<Project | null> {
    return this.getIdempotentValue(key, actor, requestHash, projectSchema, 'project');
  }

  async getIdempotentDomain(
    key: string,
    actor: string,
    requestHash: string,
  ): Promise<WorkerDomain | null> {
    return this.getIdempotentValue(key, actor, requestHash, domainSchema, 'domain');
  }

  private async getIdempotentValue<T>(
    key: string,
    actor: string,
    requestHash: string,
    schema: { parse(value: unknown): T },
    label: string,
  ): Promise<T | null> {
    const row = await this.db
      .prepare(
        `SELECT actor, request_hash, response_json, status_code, expires_at
         FROM idempotency_keys WHERE key = ?`,
      )
      .bind(key)
      .first<{
        actor: string;
        request_hash: string;
        response_json: string;
        status_code: number;
        expires_at: string;
      }>();
    if (!row || row.expires_at <= new Date().toISOString()) return null;
    if (row.actor !== actor || row.request_hash !== requestHash) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        `Use a new idempotency key for a different ${label} request.`,
      );
    }
    if (row.status_code === 102) {
      throw new AppError(
        409,
        'IDEMPOTENT_REQUEST_IN_PROGRESS',
        `This ${label} request is already in progress.`,
      );
    }
    return schema.parse(JSON.parse(row.response_json));
  }

  async reserveIdempotencyKey(key: string, actor: string, requestHash: string): Promise<void> {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    try {
      await this.db
        .prepare(
          `INSERT INTO idempotency_keys (
            key, actor, request_hash, response_json, status_code, created_at, expires_at
          ) VALUES (?, ?, ?, '', 102, ?, ?)`,
        )
        .bind(key, actor, requestHash, createdAt.toISOString(), expiresAt.toISOString())
        .run();
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new AppError(
          409,
          'IDEMPOTENT_REQUEST_IN_PROGRESS',
          'This request is already in progress.',
        );
      }
      throw error;
    }
  }

  async storeIdempotentDeployment(
    key: string,
    actor: string,
    requestHash: string,
    deployment: Deployment,
  ): Promise<void> {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    await this.db
      .prepare(
        `INSERT INTO idempotency_keys (
          key, actor, request_hash, response_json, status_code, created_at, expires_at
        ) VALUES (?, ?, ?, ?, 202, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          response_json = excluded.response_json,
          status_code = excluded.status_code`,
      )
      .bind(
        key,
        actor,
        requestHash,
        JSON.stringify(deployment),
        createdAt.toISOString(),
        expiresAt.toISOString(),
      )
      .run();
  }

  async storeIdempotentResource(
    key: string,
    actor: string,
    requestHash: string,
    resource: ManagedResource,
  ): Promise<void> {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    await this.db
      .prepare(
        `INSERT INTO idempotency_keys (
          key, actor, request_hash, response_json, status_code, created_at, expires_at
        ) VALUES (?, ?, ?, ?, 201, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          response_json = excluded.response_json,
          status_code = excluded.status_code`,
      )
      .bind(
        key,
        actor,
        requestHash,
        JSON.stringify(resource),
        createdAt.toISOString(),
        expiresAt.toISOString(),
      )
      .run();
  }

  async storeIdempotentValue(
    key: string,
    actor: string,
    requestHash: string,
    value: unknown,
    statusCode = 201,
  ): Promise<void> {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    await this.db
      .prepare(
        `INSERT INTO idempotency_keys (
          key, actor, request_hash, response_json, status_code, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          response_json = excluded.response_json,
          status_code = excluded.status_code`,
      )
      .bind(
        key,
        actor,
        requestHash,
        JSON.stringify(value),
        statusCode,
        createdAt.toISOString(),
        expiresAt.toISOString(),
      )
      .run();
  }

  async removeIdempotencyKey(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM idempotency_keys WHERE key = ?').bind(key).run();
  }
}
