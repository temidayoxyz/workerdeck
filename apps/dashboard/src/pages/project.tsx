import type {
  DashboardSummary,
  ManagedResource,
  WorkerAnalyticsProject,
  WorkerDomain,
} from '@workerdeck/contracts';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Boxes,
  Cloud,
  Code2,
  Copy,
  Database,
  ExternalLink,
  Github,
  GitBranch,
  GitCommitHorizontal,
  Globe2,
  KeyRound,
  LockKeyhole,
  Plus,
  RefreshCw,
  Rocket,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from '../components/icon';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { ShellContext } from '../components/app-shell';
import { DeploymentRail } from '../components/deployment-rail';
import { ProjectHeader } from '../components/project-header';
import { DeploymentStatus } from '../components/status';
import { NewResourceDialog } from '../components/new-resource-dialog';
import {
  deleteEnvironmentVariable,
  attachProjectDomain,
  getBuildLogs,
  getEnvironmentVariables,
  getManagedResources,
  getProjectDomains,
  getWorkerAnalytics,
  upsertEnvironmentVariable,
} from '../lib/api';
import { relativeTime, shortSha, titleCase } from '../lib/format';
import { projectReleaseState } from '../lib/project-release';

export function ProjectPage({
  summary,
  onDeploy,
}: {
  summary: DashboardSummary | null;
  onDeploy: (projectId: string, environmentId: string) => Promise<void>;
}): React.JSX.Element {
  const { projectId } = useParams();
  const project = summary?.projects.find((candidate) => candidate.id === projectId);
  const environment = summary?.environments.find(
    (candidate) => candidate.projectId === projectId && candidate.kind === 'production',
  );
  const [resources, setResources] = useState<ManagedResource[]>([]);
  const [analytics, setAnalytics] = useState<WorkerAnalyticsProject | null>(null);
  useEffect(() => {
    let active = true;
    void getManagedResources()
      .then((items) => {
        if (active) setResources(items.filter((item) => item.projectId === projectId));
      })
      .catch(() => {
        if (active) setResources([]);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  useEffect(() => {
    let active = true;
    if (!environment?.workerName) {
      setAnalytics(null);
      return () => {
        active = false;
      };
    }
    void getWorkerAnalytics(24, environment.workerName)
      .then((result) => {
        if (active) {
          setAnalytics(
            result.projects.find((item) => item.workerName === environment.workerName) ?? null,
          );
        }
      })
      .catch(() => {
        if (active) setAnalytics(null);
      });
    return () => {
      active = false;
    };
  }, [environment?.workerName]);
  if (!project) return <MissingProject />;
  const current = summary?.deployments.find(
    (deployment) =>
      deployment.projectId === project.id && deployment.environmentId === environment?.id,
  );
  return (
    <div className="project-page">
      <ProjectHeader
        project={project}
        environment={environment}
        onDeploy={() => environment && void onDeploy(project.id, environment.id)}
      />
      <div className="project-overview-grid">
        <section className="panel project-current-card">
          <div className="section-heading">
            <h2>Current deployment</h2>
            {current ? <DeploymentStatus status={current.status} /> : null}
          </div>
          {current ? (
            <>
              <dl className="definition-grid">
                <div>
                  <dt>Commit</dt>
                  <dd>
                    <code>{shortSha(current.gitCommitSha)}</code> {current.gitCommitMessage}
                  </dd>
                </div>
                <div>
                  <dt>Deployed</dt>
                  <dd>{relativeTime(current.createdAt)}</dd>
                </div>
                <div>
                  <dt>Branch</dt>
                  <dd>{current.gitBranch ?? project.productionBranch}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{current.workerVersionId ?? 'Building'}</dd>
                </div>
              </dl>
              <DeploymentRail deployment={current} />
            </>
          ) : (
            <p className="empty-copy">Deploy this project to create its first Worker version.</p>
          )}
        </section>
        <section className="panel runtime-card">
          <div className="section-heading">
            <h2>Runtime</h2>
            <Cloud size={18} />
          </div>
          <dl className="definition-list">
            <div>
              <dt>Platform</dt>
              <dd>Cloudflare Worker</dd>
            </div>
            <div>
              <dt>Framework</dt>
              <dd>{titleCase(project.framework)}</dd>
            </div>
            <div>
              <dt>Worker</dt>
              <dd>
                <code>{environment?.workerName ?? 'Not connected'}</code>
              </dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{titleCase(summary?.account.plan ?? 'unknown')}</dd>
            </div>
          </dl>
        </section>
        <section className={`panel traffic-card${analytics ? '' : ' traffic-card--empty'}`}>
          <div className="section-heading">
            <h2>
              Runtime telemetry <span>· last 24 hours</span>
            </h2>
            <Activity size={18} />
          </div>
          {analytics ? (
            <>
              <div className="project-analytics-kpis">
                <strong>
                  {compactNumber(analytics.requests)}
                  <small>Requests</small>
                </strong>
                <strong>
                  {percent(analytics.errorRate)}
                  <small>Errors</small>
                </strong>
                <strong>
                  {duration(analytics.cpuTimeP99)}
                  <small>CPU p99</small>
                </strong>
              </div>
              <ProjectAnalyticsChart points={analytics.points} />
            </>
          ) : (
            <div className="telemetry-empty">
              <Activity size={24} />
              <span>
                <strong>No Worker invocations in this window</strong>
                <small>Cloudflare returned no sampled analytics rows for this Worker.</small>
              </span>
            </div>
          )}
        </section>
        <section className="panel project-side-stack">
          <div className="section-heading">
            <h2>Bound resources</h2>
            <Link to="resources">
              <Plus size={15} /> Add
            </Link>
          </div>
          <div className="compact-list">
            {resources.slice(0, 3).map((resource) => (
              <div key={resource.id}>
                {resource.kind === 'd1' ? <Database size={16} /> : <Boxes size={16} />}
                <span>
                  <strong>{resource.name}</strong>
                  <small>{resource.kind.toUpperCase()} resource</small>
                </span>
                <i />
              </div>
            ))}
            {resources.length === 0 ? (
              <p className="empty-copy">No owned resources are attached.</p>
            ) : null}
          </div>
          <Link className="environment-callout" to="variables">
            <span>
              <KeyRound size={17} />
              <strong>Environment</strong>
              <small>Build variables and runtime secrets</small>
            </span>
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </div>
  );
}

export function ProjectDeploymentsPage({
  summary,
  onDeploy,
}: {
  summary: DashboardSummary | null;
  onDeploy: (projectId: string, environmentId: string) => Promise<void>;
}): React.JSX.Element {
  const { projectId } = useParams();
  const { deploymentDeleted } = useOutletContext<ShellContext>();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const project = summary?.projects.find((candidate) => candidate.id === projectId);
  const environment = summary?.environments.find(
    (candidate) => candidate.projectId === projectId && candidate.kind === 'production',
  );
  if (!project) return <MissingProject />;
  const deployments = summary?.deployments.filter((item) => item.projectId === project.id) ?? [];
  return (
    <div className="project-page">
      <ProjectHeader
        project={project}
        environment={environment}
        onDeploy={() => environment && void onDeploy(project.id, environment.id)}
      />
      <section className="project-section-intro">
        <div>
          <h2>Deployments</h2>
          <p>Every build and Worker version across this project.</p>
        </div>
      </section>
      <section className="panel data-table">
        {deleteError ? <div className="inline-alert">{deleteError}</div> : null}
        <div className="data-row data-row--header">
          <span>Status</span>
          <span>Version</span>
          <span>Commit</span>
          <span>Branch</span>
          <span>Triggered by</span>
          <span>Created</span>
          <span />
        </div>
        {deployments.map((deployment) => (
          <div className="data-row" key={deployment.id}>
            <DeploymentStatus status={deployment.status} />
            <code>{deployment.workerVersionId ?? '—'}</code>
            <span className="commit-cell">
              <GitCommitHorizontal size={14} />
              <span>
                <strong>{deployment.gitCommitMessage ?? 'Manual deployment'}</strong>
                <small>{shortSha(deployment.gitCommitSha)}</small>
              </span>
            </span>
            <code>{deployment.gitBranch ?? project.productionBranch}</code>
            <span>{deployment.triggeredBy}</span>
            <span>{relativeTime(deployment.createdAt)}</span>
            <span className="deployment-actions">
              <Link
                className="row-action"
                to={`/projects/${project.id}/logs/${deployment.id}`}
                aria-label={`View build logs for ${deployment.gitCommitMessage ?? 'deployment'}`}
              >
                <Code2 size={15} />
              </Link>
              <button
                className="row-action danger-action"
                type="button"
                aria-label="Delete deployment"
                disabled={
                  deleting === deployment.id ||
                  ['queued', 'building', 'deploying'].includes(deployment.status)
                }
                onClick={() => {
                  if (
                    !window.confirm(
                      'Delete this deployment record? WorkerDeck will also remove its historical Cloudflare Worker deployment when one exists. Cloudflare build logs follow Cloudflare retention.',
                    )
                  )
                    return;
                  setDeleting(deployment.id);
                  setDeleteError(null);
                  void deploymentDeleted(deployment.id)
                    .catch((reason: unknown) =>
                      setDeleteError(
                        reason instanceof Error
                          ? reason.message
                          : 'The deployment could not be deleted.',
                      ),
                    )
                    .finally(() => setDeleting(null));
                }}
              >
                <Trash2 size={16} />
              </button>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

export function ProjectVariablesPage({
  summary,
  onDeploy,
}: {
  summary: DashboardSummary | null;
  onDeploy: (projectId: string, environmentId: string) => Promise<void>;
}): React.JSX.Element {
  const { projectId } = useParams();
  const project = summary?.projects.find((candidate) => candidate.id === projectId);
  const environment = summary?.environments.find(
    (candidate) => candidate.projectId === projectId && candidate.kind === 'production',
  );
  const [data, setData] = useState<Awaited<ReturnType<typeof getEnvironmentVariables>> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!project || !environment) return;
    void getEnvironmentVariables(project.id, environment.id)
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Variables could not load.'),
      );
  }, [project, environment]);
  if (!project) return <MissingProject />;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!environment) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const rawKey = values.get('key');
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    const target = values.get('target') === 'runtime_secret' ? 'runtime_secret' : 'build';
    const secret = target === 'runtime_secret' || values.get('secret') === 'on';
    const rawValue = values.get('value');
    const value = typeof rawValue === 'string' ? rawValue : '';
    setSaving(true);
    setError(null);
    try {
      const variable = await upsertEnvironmentVariable(project.id, environment.id, key, {
        target,
        secret,
        value,
      });
      setData((current) =>
        current
          ? {
              ...current,
              variables: [
                variable,
                ...current.variables.filter(
                  (item) => !(item.key === key && item.target === target),
                ),
              ],
            }
          : current,
      );
      form.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Variable could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="project-page">
      <ProjectHeader
        project={project}
        environment={environment}
        onDeploy={() => environment && void onDeploy(project.id, environment.id)}
      />
      <section className="project-section-intro">
        <div>
          <h2>Environment variables</h2>
          <p>
            Control build configuration and encrypted runtime secrets without exposing credentials.
          </p>
        </div>
      </section>
      <div className="variables-layout">
        <section className="panel variables-card">
          <div className="section-heading">
            <div>
              <h2>Production</h2>
              <p>{data?.variables.length ?? 0} configured values</p>
            </div>
            <span className="environment-badge">Active</span>
          </div>
          {error ? <div className="inline-alert">{error}</div> : null}
          <div className="variable-list">
            {data?.variables.map((variable) => (
              <div className="variable-row" key={`${variable.target}-${variable.key}`}>
                <span className="variable-icon">
                  {variable.secret ? <LockKeyhole size={16} /> : <KeyRound size={16} />}
                </span>
                <span>
                  <strong>{variable.key}</strong>
                  <small>
                    {variable.target === 'build' ? 'Build time' : 'Worker runtime'} ·{' '}
                    {variable.secret ? 'Encrypted secret' : 'Visible value'}
                  </small>
                </span>
                <code>{variable.secret ? '••••••••••••' : variable.value}</code>
                <button
                  type="button"
                  className="row-action danger-action"
                  aria-label={`Delete ${variable.key}`}
                  onClick={() => {
                    if (
                      !environment ||
                      !window.confirm(
                        `Delete ${variable.key} from ${variable.target === 'build' ? 'builds' : 'the Worker runtime'}?`,
                      )
                    )
                      return;
                    void deleteEnvironmentVariable(
                      project.id,
                      environment.id,
                      variable.key,
                      variable.target,
                    )
                      .then(() =>
                        setData((current) =>
                          current
                            ? {
                                ...current,
                                variables: current.variables.filter((item) => item !== variable),
                              }
                            : current,
                        ),
                      )
                      .catch((reason: unknown) =>
                        setError(
                          reason instanceof Error
                            ? reason.message
                            : 'Variable could not be deleted.',
                        ),
                      );
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {data?.variables.length === 0 ? (
              <p className="empty-copy">No values configured for this environment.</p>
            ) : null}
          </div>
        </section>
        <form className="panel variable-form" onSubmit={(event) => void submit(event)}>
          <div>
            <span className="eyebrow">Add variable</span>
            <h2>Set a value</h2>
            <p>Runtime secrets are write-only. WorkerDeck never stores or returns their value.</p>
          </div>
          <label>
            <span>Name</span>
            <input
              name="key"
              placeholder="PAYMENT_API_KEY"
              pattern="[A-Za-z_][A-Za-z0-9_]*"
              required
            />
          </label>
          <label>
            <span>Target</span>
            <select name="target" defaultValue="runtime_secret">
              <option value="runtime_secret">Worker runtime secret</option>
              <option value="build">Build environment</option>
            </select>
          </label>
          <label>
            <span>Value</span>
            <input
              name="value"
              type="password"
              autoComplete="new-password"
              placeholder="Enter a new value"
              required
            />
          </label>
          <label className="checkbox-row">
            <input name="secret" type="checkbox" defaultChecked />
            <span>Encrypt this build value</span>
          </label>
          <button className="button button--primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save variable'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function ProjectLogsPage({
  summary,
  onDeploy,
}: {
  summary: DashboardSummary | null;
  onDeploy: (projectId: string, environmentId: string) => Promise<void>;
}): React.JSX.Element {
  const { projectId, deploymentId } = useParams();
  const project = summary?.projects.find((candidate) => candidate.id === projectId);
  const environment = summary?.environments.find(
    (candidate) => candidate.projectId === projectId && candidate.kind === 'production',
  );
  const latestForProject = summary?.deployments.find(
    (deployment) =>
      deployment.projectId === projectId && deployment.environmentId === environment?.id,
  );
  const latest = deploymentId
    ? summary?.deployments.find((deployment) => deployment.id === deploymentId)
    : latestForProject;
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof getBuildLogs>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!latest) return;
    void getBuildLogs(latest.id)
      .then(setLogs)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Build logs could not load.'),
      );
  }, [latest]);
  if (!project) return <MissingProject />;
  return (
    <div className="project-page">
      <ProjectHeader
        project={project}
        environment={environment}
        onDeploy={() => environment && void onDeploy(project.id, environment.id)}
      />
      <section className="project-section-intro">
        <div>
          <h2>Build logs</h2>
          <p>Immutable Workers Builds output for the selected deployment.</p>
        </div>
        {latest ? (
          <div className="log-actions">
            <button
              className="button button--secondary"
              type="button"
              disabled={!logs?.lines.length}
              onClick={() => {
                const output = logs?.lines
                  .map((line) =>
                    `${line.timestamp ? new Date(line.timestamp > 1e12 ? line.timestamp : line.timestamp * 1000).toISOString() : ''}\t${line.message}`.trim(),
                  )
                  .join('\n');
                if (!output) return;
                void navigator.clipboard
                  .writeText(output)
                  .then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                  })
                  .catch(() => setError('The browser could not copy these logs.'));
              }}
            >
              <Copy size={15} />
              {copied ? 'Copied' : 'Copy logs'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() =>
                void getBuildLogs(latest.id)
                  .then(setLogs)
                  .catch((reason: unknown) =>
                    setError(
                      reason instanceof Error ? reason.message : 'Build logs could not load.',
                    ),
                  )
              }
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
        ) : null}
      </section>
      <section className="panel build-log-panel">
        <div className="section-heading">
          <div>
            <h2>{latest?.gitCommitMessage ?? 'No deployment selected'}</h2>
            <p>{latest?.buildId ?? 'Deploy the project to generate build logs.'}</p>
          </div>
          <span className="healthy-label">
            <i /> Cloudflare Workers Builds
          </span>
        </div>
        {error ? <div className="inline-alert">{error}</div> : null}
        {logs?.diagnosis ? (
          <div className="build-diagnosis" role="status">
            <span className="build-diagnosis-icon">
              <AlertCircle size={18} />
            </span>
            <div>
              <strong>{logs.diagnosis.title}</strong>
              <p>{logs.diagnosis.remediation}</p>
            </div>
          </div>
        ) : null}
        <div className="build-log-stream">
          {logs?.lines.map((line, index) => (
            <div key={`${line.timestamp ?? 'line'}-${index}`}>
              <time>
                {line.timestamp
                  ? new Date(
                      line.timestamp > 1e12 ? line.timestamp : line.timestamp * 1000,
                    ).toLocaleTimeString([], { hour12: false })
                  : '—'}
              </time>
              <code>{line.message}</code>
            </div>
          ))}
          {!logs && !error ? <p>Loading build output…</p> : null}
          {logs?.lines.length === 0 ? <p>No log lines were returned for this build.</p> : null}
        </div>
      </section>
    </div>
  );
}

export function ProjectResourcesPage({
  summary,
  onDeploy,
}: {
  summary: DashboardSummary | null;
  onDeploy: (projectId: string, environmentId: string) => Promise<void>;
}): React.JSX.Element {
  const { projectId } = useParams();
  const project = summary?.projects.find((candidate) => candidate.id === projectId);
  const environment = summary?.environments.find(
    (candidate) => candidate.projectId === projectId && candidate.kind === 'production',
  );
  const [resources, setResources] = useState<ManagedResource[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  useEffect(() => {
    void getManagedResources().then((items) =>
      setResources(items.filter((item) => item.projectId === projectId)),
    );
  }, [projectId]);
  if (!project) return <MissingProject />;
  return (
    <div className="project-page">
      <ProjectHeader
        project={project}
        environment={environment}
        onDeploy={() => environment && void onDeploy(project.id, environment.id)}
      />
      <section className="project-section-intro">
        <div>
          <h2>Resources</h2>
          <p>D1, KV, and R2 resources owned by this project.</p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={() => setDialogOpen(true)}
        >
          <Plus size={15} />
          Add resource
        </button>
      </section>
      <section className="panel data-table project-resource-table">
        <div className="data-row data-row--header">
          <span>Name</span>
          <span>Type</span>
          <span>Provider ID</span>
          <span>Ownership</span>
          <span>Created</span>
        </div>
        {resources.map((resource) => (
          <div className="data-row" key={resource.id}>
            <span className="resource-name-cell">
              <Database size={16} />
              <strong>{resource.name}</strong>
            </span>
            <span>{resource.kind.toUpperCase()}</span>
            <code>{resource.cloudflareId}</code>
            <span className="healthy-label">
              <i /> WorkerDeck managed
            </span>
            <span>{relativeTime(resource.createdAt)}</span>
          </div>
        ))}
        {resources.length === 0 ? (
          <div className="table-empty-row">No owned resources are attached to this project.</div>
        ) : null}
      </section>
      <NewResourceDialog
        open={dialogOpen}
        summary={summary}
        onClose={() => setDialogOpen(false)}
        onCreated={(resource) => {
          setResources((current) => [resource, ...current]);
          setDialogOpen(false);
        }}
      />
    </div>
  );
}

export function ProjectDomainsPage({
  summary,
  onDeploy,
}: {
  summary: DashboardSummary | null;
  onDeploy: (projectId: string, environmentId: string) => Promise<void>;
}): React.JSX.Element {
  const { projectId } = useParams();
  const project = summary?.projects.find((candidate) => candidate.id === projectId);
  const environment = summary?.environments.find(
    (candidate) => candidate.projectId === projectId && candidate.kind === 'production',
  );
  const release = project
    ? projectReleaseState(project.id, summary?.environments ?? [], summary?.deployments ?? [])
    : null;
  const [domains, setDomains] = useState<WorkerDomain[]>([]);
  const [hostname, setHostname] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainSubmitting, setDomainSubmitting] = useState(false);
  useEffect(() => {
    if (!projectId || !environment) return;
    let active = true;
    void getProjectDomains(projectId, environment.id)
      .then((items) => {
        if (active) setDomains(items);
      })
      .catch((reason: unknown) => {
        if (active) {
          setDomainError(reason instanceof Error ? reason.message : 'Domains could not be loaded.');
        }
      });
    return () => {
      active = false;
    };
  }, [environment, projectId]);
  if (!project) return <MissingProject />;
  return (
    <div className="project-page">
      <ProjectHeader
        project={project}
        environment={environment}
        onDeploy={() => environment && void onDeploy(project.id, environment.id)}
      />
      <section className="project-section-intro">
        <div>
          <h2>Domains</h2>
          <p>System hostname and custom Worker route configuration.</p>
        </div>
        <form
          className="domain-attach-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!environment) return;
            setDomainSubmitting(true);
            setDomainError(null);
            void attachProjectDomain(project.id, environment.id, hostname)
              .then((domain) => {
                setDomains((current) => [domain, ...current]);
                setHostname('');
              })
              .catch((reason: unknown) =>
                setDomainError(
                  reason instanceof Error ? reason.message : 'The domain could not be attached.',
                ),
              )
              .finally(() => setDomainSubmitting(false));
          }}
        >
          <input
            type="text"
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            placeholder="app.example.com"
            aria-label="Custom domain hostname"
            required
          />
          <button className="button button--primary" type="submit" disabled={domainSubmitting}>
            {domainSubmitting ? 'Attaching…' : 'Add domain'}
          </button>
        </form>
      </section>
      <div className="operations-grid">
        <section className="panel domain-project-card">
          <div className="section-heading">
            <h2>System domain</h2>
            <span className={`healthy-label health-badge--${release?.tone ?? 'inactive'}`}>
              <i /> {release?.label ?? 'Not deployed'}
            </span>
          </div>
          <div className="domain-route-row">
            <Globe2 size={21} />
            <span>
              <strong>
                {environment?.url ? new URL(environment.url).hostname : 'Not assigned yet'}
              </strong>
              <small>Cloudflare-managed hostname and TLS</small>
            </span>
            {environment?.url ? (
              <a href={environment.url} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
              </a>
            ) : null}
          </div>
        </section>
        <aside className="panel detail-panel">
          <span className="eyebrow">Custom domains</span>
          <h2>{domains.length} attached</h2>
          <p>
            Cloudflare creates the DNS record and certificate. WorkerDeck records ownership and
            compensates the provider mutation if its ledger write fails.
          </p>
          <div className="domain-list">
            {domains.map((domain) => (
              <span key={domain.id}>
                <Globe2 size={15} />
                <strong>{domain.hostname}</strong>
                <small>{domain.zoneName}</small>
              </span>
            ))}
            {domains.length === 0 ? <small>No custom domain is attached.</small> : null}
          </div>
          {domainError ? <div className="inline-alert">{domainError}</div> : null}
        </aside>
      </div>
    </div>
  );
}

export function ProjectSettingsPage({
  summary,
  onDeploy,
}: {
  summary: DashboardSummary | null;
  onDeploy: (projectId: string, environmentId: string) => Promise<void>;
}): React.JSX.Element {
  const { projectId } = useParams();
  const { projectDeleted } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (deleteOpen && !dialog.open) dialog.showModal();
    if (!deleteOpen && dialog.open) dialog.close();
  }, [deleteOpen]);
  const project = summary?.projects.find((candidate) => candidate.id === projectId);
  const environment = summary?.environments.find(
    (candidate) => candidate.projectId === projectId && candidate.kind === 'production',
  );
  if (!project) return <MissingProject />;
  return (
    <div className="project-page">
      <ProjectHeader
        project={project}
        environment={environment}
        onDeploy={() => environment && void onDeploy(project.id, environment.id)}
      />
      <section className="project-section-intro">
        <div>
          <h2>Project settings</h2>
          <p>Source, build target, and irreversible project controls.</p>
        </div>
      </section>
      <div className="project-settings-stack">
        <section className="panel settings-section">
          <div className="settings-icon">
            <Github size={20} />
          </div>
          <div>
            <h2>Source repository</h2>
            <p>
              {project.repositoryOwner}/{project.repositoryName}
            </p>
            <div className="settings-value">
              <span>
                <GitBranch size={14} />
                {project.productionBranch}
              </span>
              <code>{project.repositoryUrl}</code>
            </div>
          </div>
          <a
            className="button button--secondary"
            href={project.repositoryUrl ?? '#'}
            target="_blank"
            rel="noreferrer"
          >
            Open repository <ExternalLink size={14} />
          </a>
        </section>
        <section className="panel settings-section">
          <div className="settings-icon">
            <Code2 size={20} />
          </div>
          <div>
            <h2>Build target</h2>
            <p>Workers Builds deploys into this Cloudflare Worker.</p>
            <div className="settings-value">
              <span>
                <ShieldCheck size={14} />
                Owned environment
              </span>
              <code>{environment?.workerName}</code>
            </div>
          </div>
          <Link className="button button--secondary" to={`/projects/${project.id}/deployments`}>
            Deployment history
          </Link>
        </section>
        <section className="panel settings-section danger-settings">
          <div className="settings-icon">
            <Settings size={20} />
          </div>
          <div>
            <h2>Delete project</h2>
            <p>
              Permanently remove this project, its deployment history, and every Cloudflare resource
              recorded as WorkerDeck-owned. The GitHub repository is never deleted.
            </p>
          </div>
          <button
            className="button button--danger"
            type="button"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={15} />
            Delete project
          </button>
        </section>
      </div>
      <dialog
        ref={deleteDialogRef}
        className="project-dialog delete-project-dialog"
        onCancel={(event) => {
          if (deleting) event.preventDefault();
          else setDeleteOpen(false);
        }}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Danger zone</span>
            <h2>Delete {project.name}?</h2>
            <p>
              This cannot be undone. WorkerDeck will tear down its Cloudflare resources before
              removing the project record.
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close dialog"
            disabled={deleting}
            onClick={() => setDeleteOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <form
          className="project-form"
          onSubmit={(event) => {
            event.preventDefault();
            setDeleting(true);
            setDeleteError(null);
            void projectDeleted(project.id, confirmation)
              .then(() => void navigate('/projects'))
              .catch((reason: unknown) =>
                setDeleteError(
                  reason instanceof Error ? reason.message : 'The project could not be deleted.',
                ),
              )
              .finally(() => setDeleting(false));
          }}
        >
          <div className="deletion-impact">
            <span className="deletion-impact__marker">
              <Trash2 size={18} />
            </span>
            <span>
              <strong>Cloudflare teardown manifest</strong>
              <small>
                Build triggers, the managed Worker, attached WorkerDeck domains, and owned D1/KV/R2
                resources.
              </small>
            </span>
          </div>
          <label>
            <span>
              Enter <strong>{project.name}</strong> to confirm
            </span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoFocus
            />
          </label>
          {deleteError ? <div className="form-error">{deleteError}</div> : null}
          <div className="dialog-actions">
            <button
              className="button button--secondary"
              type="button"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </button>
            <button
              className="button button--danger"
              type="submit"
              disabled={confirmation !== project.name || deleting}
            >
              <Trash2 size={15} />
              {deleting ? 'Deleting project…' : 'Delete project'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function MissingProject(): React.JSX.Element {
  const { summary } = useOutletContext<ShellContext>();
  return (
    <section className="placeholder-surface panel">
      <Rocket size={24} />
      <h2>Project not found</h2>
      <p>{summary ? 'This project is not part of the current workspace.' : 'Loading project…'}</p>
      <Link to="/projects">Return to projects</Link>
    </section>
  );
}

function ProjectAnalyticsChart({
  points,
}: {
  points: WorkerAnalyticsProject['points'];
}): React.JSX.Element {
  const width = 700;
  const height = 150;
  const max = Math.max(...points.map((point) => point.requests), 1);
  const path = points
    .map((point, index) => {
      const x = 10 + (index / Math.max(points.length - 1, 1)) * (width - 20);
      const y = height - 10 - (point.requests / max) * (height - 20);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      className="project-analytics-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label="Cloudflare request volume"
    >
      <path className="chart-grid" d="M0 35H700M0 75H700M0 115H700" />
      {points.length > 0 ? <path className="request-line" d={path} /> : null}
    </svg>
  );
}

function compactNumber(value: number): string {
  return Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function percent(value: number): string {
  return Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(value);
}

function duration(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(value >= 10 ? 0 : 1)}ms`;
}
