import type {
  DashboardSummary,
  ManagedResource,
  WebAnalytics,
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
  Gauge,
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
  detachProjectDomain,
  setSystemDomainEnabled,
  getProjectTraffic,
  setProjectTraffic,
  getCronSchedules,
  setCronSchedules,
  getBuildLogs,
  getEnvironmentVariables,
  getManagedResources,
  getProjectDomains,
  getWebAnalytics,
  getWorkerAnalytics,
  upsertEnvironmentVariable,
} from '../lib/api';
import { relativeTime, shortSha, titleCase } from '../lib/format';
import { frameworkLabel } from '../lib/framework-label';
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
  const [webAnalytics, setWebAnalytics] = useState<WebAnalytics | null>(null);
  const [webAnalyticsStatus, setWebAnalyticsStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
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
  useEffect(() => {
    let active = true;
    if (!projectId || !environment) {
      setWebAnalytics(null);
      setWebAnalyticsStatus('loading');
      return () => {
        active = false;
      };
    }
    setWebAnalyticsStatus('loading');
    void getWebAnalytics(projectId, environment.id, 24)
      .then((result) => {
        if (!active) return;
        setWebAnalytics(result);
        setWebAnalyticsStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setWebAnalytics(null);
        setWebAnalyticsStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, [projectId, environment?.id]);
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
              <dd>{frameworkLabel(project.framework)}</dd>
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
        <section
          className={`panel web-analytics-card${
            webAnalyticsStatus === 'ready' && webAnalytics && hasWebAnalyticsData(webAnalytics)
              ? ''
              : ' web-analytics-card--empty'
          }`}
        >
          <div className="section-heading">
            <h2>
              Web Analytics <span>· Core Web Vitals · last 24 hours</span>
            </h2>
            <Gauge size={18} />
          </div>
          {webAnalyticsStatus === 'loading' ? (
            <div className="telemetry-empty">
              <Gauge size={24} />
              <span>
                <strong>Querying Cloudflare Web Analytics…</strong>
                <small>Core Web Vitals are collected from real browser beacons.</small>
              </span>
            </div>
          ) : webAnalyticsStatus === 'unavailable' ? (
            <div className="telemetry-empty">
              <AlertCircle size={24} />
              <span>
                <strong>Web Analytics unavailable</strong>
                <small>
                  WorkerDeck could not query Cloudflare real-user metrics for this project.
                </small>
              </span>
            </div>
          ) : webAnalytics && hasWebAnalyticsData(webAnalytics) ? (
            <div className="web-analytics-layout">
              <div className="web-visitors-block">
                <div className="web-visitor-kpis">
                  <strong>
                    {compactNumber(webAnalytics.visits)}
                    <small>Visits</small>
                  </strong>
                  <strong>
                    {compactNumber(webAnalytics.pageViews)}
                    <small>Page views</small>
                  </strong>
                </div>
                <span className="web-visitors-scope">
                  <Globe2 size={14} />
                  {webAnalytics.hostnames.join('  ·  ')}
                </span>
              </div>
              <WebVitalsRail vitals={webAnalytics.vitals} />
              <WebAnalyticsTopPaths paths={webAnalytics.topPaths} total={webAnalytics.pageViews} />
            </div>
          ) : (
            <div className="telemetry-empty">
              <Gauge size={24} />
              <span>
                <strong>No Web Analytics beacons in this window</strong>
                <small>
                  Cloudflare reports real-user metrics only for pages that send beacons. Add the Web
                  Analytics snippet to the production build, or serve the site through a proxied
                  Cloudflare zone.
                </small>
              </span>
            </div>
          )}
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
  const [traffic, setTraffic] = useState<{
    id: string;
    versions: Array<{ percentage: number; versionId: string }>;
  } | null>(null);
  const [trafficInputs, setTrafficInputs] = useState<Record<string, string>>({});
  const [trafficSaving, setTrafficSaving] = useState(false);
  const [trafficError, setTrafficError] = useState<string | null>(null);
  const project = summary?.projects.find((candidate) => candidate.id === projectId);
  const environment = summary?.environments.find(
    (candidate) => candidate.projectId === projectId && candidate.kind === 'production',
  );
  useEffect(() => {
    if (!environment) return;
    let active = true;
    void getProjectTraffic(projectId ?? '', environment.id)
      .then((value) => {
        if (!active || !value) return;
        setTraffic(value);
        setTrafficInputs(
          Object.fromEntries(
            value.versions.map((version) => [version.versionId, String(version.percentage)]),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [environment, projectId]);
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
            <span className="status-cell">
              <DeploymentStatus status={deployment.status} />
              {summary?.environments.find((candidate) => candidate.id === deployment.environmentId)
                ?.kind === 'preview' ? (
                <span className="environment-badge">Preview</span>
              ) : null}
            </span>
            <code>{deployment.workerVersionId ?? '—'}</code>
            <span className="commit-cell">
              <GitCommitHorizontal size={14} />
              <span>
                <strong>{deployment.gitCommitMessage ?? 'Manual deployment'}</strong>
                <small>{shortSha(deployment.gitCommitSha)}</small>
                {deployment.previewUrl ? (
                  <a
                    className="preview-url-link"
                    href={deployment.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={deployment.previewUrl}
                  >
                    <ExternalLink size={12} />
                    <span>{new URL(deployment.previewUrl).hostname}</span>
                  </a>
                ) : null}
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
      <section className="panel traffic-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Production traffic</span>
            <h2>Version routing</h2>
          </div>
          {traffic ? (
            <button
              className="button button--primary"
              type="button"
              disabled={trafficSaving}
              onClick={() => {
                if (!environment) return;
                const versions = traffic.versions.map((version) => ({
                  versionId: version.versionId,
                  percentage: Number(trafficInputs[version.versionId] ?? version.percentage),
                }));
                if (versions.reduce((sum, version) => sum + version.percentage, 0) !== 100) {
                  setTrafficError('Traffic percentages must total 100.');
                  return;
                }
                setTrafficSaving(true);
                setTrafficError(null);
                void setProjectTraffic(project.id, environment.id, versions)
                  .catch((reason: unknown) =>
                    setTrafficError(
                      reason instanceof Error ? reason.message : 'Traffic could not be updated.',
                    ),
                  )
                  .finally(() => setTrafficSaving(false));
              }}
            >
              {trafficSaving ? 'Applyingâ€¦' : 'Apply traffic'}
            </button>
          ) : null}
        </div>
        {traffic ? (
          <div className="traffic-list">
            {traffic.versions.map((version) => {
              const deployment = deployments.find(
                (candidate) => candidate.workerVersionId === version.versionId,
              );
              return (
                <div className="traffic-row" key={version.versionId}>
                  <span className="traffic-commit">
                    <strong>
                      {deployment
                        ? (deployment.gitCommitMessage ?? shortSha(deployment.gitCommitSha))
                        : `Version ${version.versionId.slice(0, 7)}`}
                    </strong>
                    <small>
                      {deployment ? shortSha(deployment.gitCommitSha) : 'Provider version'}
                    </small>
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={trafficInputs[version.versionId] ?? String(version.percentage)}
                    onChange={(event) =>
                      setTrafficInputs((current) => ({
                        ...current,
                        [version.versionId]: event.target.value,
                      }))
                    }
                    aria-label="Traffic percentage"
                  />
                  <span>%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted-copy traffic-empty">
            Traffic routing appears after the first production deployment.
          </p>
        )}
        {trafficError ? <div className="inline-alert">{trafficError}</div> : null}
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
  useEffect(() => {
    if (!latest || !['queued', 'building', 'deploying'].includes(latest.status)) return;
    const timer = window.setInterval(() => {
      void getBuildLogs(latest.id)
        .then(setLogs)
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
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
  const environments =
    summary?.environments.filter((candidate) => candidate.projectId === projectId) ?? [];
  const productionEnvironment = environments.find((candidate) => candidate.kind === 'production');
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const selectedEnvironment =
    environments.find((candidate) => candidate.id === environmentId) ??
    productionEnvironment ??
    environments[0];
  const release = project
    ? projectReleaseState(project.id, summary?.environments ?? [], summary?.deployments ?? [])
    : null;
  const [domains, setDomains] = useState<WorkerDomain[]>([]);
  const [hostname, setHostname] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainSubmitting, setDomainSubmitting] = useState(false);
  const [detaching, setDetaching] = useState<string | null>(null);
  const [subdomainEnabled, setSubdomainEnabled] = useState<boolean | null>(null);
  const [subdomainSaving, setSubdomainSaving] = useState(false);
  useEffect(() => {
    if (!environmentId && productionEnvironment) setEnvironmentId(productionEnvironment.id);
  }, [environmentId, productionEnvironment]);
  useEffect(() => {
    if (subdomainEnabled === null && productionEnvironment) {
      setSubdomainEnabled(Boolean(productionEnvironment.url));
    }
  }, [productionEnvironment, subdomainEnabled]);
  useEffect(() => {
    if (!projectId || !environmentId) return;
    let active = true;
    void getProjectDomains(projectId, environmentId)
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
  }, [environmentId, projectId]);
  if (!project) return <MissingProject />;
  return (
    <div className="project-page">
      <ProjectHeader
        project={project}
        environment={productionEnvironment}
        onDeploy={() =>
          productionEnvironment && void onDeploy(project.id, productionEnvironment.id)
        }
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
            if (!selectedEnvironment) return;
            setDomainSubmitting(true);
            setDomainError(null);
            void attachProjectDomain(project.id, selectedEnvironment.id, hostname)
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
          <select
            value={selectedEnvironment?.id ?? ''}
            onChange={(event) => setEnvironmentId(event.target.value)}
            aria-label="Environment for the custom domain"
          >
            {environments.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.kind === 'production' ? 'Production' : 'Preview'}
              </option>
            ))}
          </select>
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
                {subdomainEnabled === false
                  ? 'System domain disabled'
                  : productionEnvironment?.url
                    ? new URL(productionEnvironment.url).hostname
                    : 'Not assigned yet'}
              </strong>
              <small>Cloudflare-managed hostname and TLS</small>
            </span>
            {productionEnvironment?.url ? (
              <a href={productionEnvironment.url} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
              </a>
            ) : null}
          </div>
          {productionEnvironment ? (
            <div className="domain-route-footer">
              <span>{subdomainEnabled ? 'workers.dev enabled' : 'workers.dev disabled'}</span>
              <button
                className="button button--secondary"
                type="button"
                disabled={subdomainSaving}
                onClick={() => {
                  const next = !subdomainEnabled;
                  setSubdomainEnabled(next);
                  setSubdomainSaving(true);
                  setDomainError(null);
                  void setSystemDomainEnabled(project.id, productionEnvironment.id, next)
                    .catch((reason: unknown) => {
                      setSubdomainEnabled(!next);
                      setDomainError(
                        reason instanceof Error
                          ? reason.message
                          : 'The system domain could not be updated.',
                      );
                    })
                    .finally(() => setSubdomainSaving(false));
                }}
              >
                {subdomainEnabled ? 'Disable system domain' : 'Enable system domain'}
              </button>
            </div>
          ) : null}
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
                <span className="domain-row-end">
                  <small>{domain.zoneName}</small>
                  <button
                    className="row-action danger-action"
                    type="button"
                    aria-label={`Detach ${domain.hostname}`}
                    disabled={detaching === domain.id}
                    onClick={() => {
                      if (!selectedEnvironment) return;
                      setDetaching(domain.id);
                      setDomainError(null);
                      void detachProjectDomain(project.id, selectedEnvironment.id, domain.id)
                        .then(() =>
                          setDomains((current) =>
                            current.filter((candidate) => candidate.id !== domain.id),
                          ),
                        )
                        .catch((reason: unknown) =>
                          setDomainError(
                            reason instanceof Error
                              ? reason.message
                              : 'The domain could not be detached.',
                          ),
                        )
                        .finally(() => setDetaching(null));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
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

export function ProjectCronPage({
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
  const [schedules, setSchedules] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId || !environment) return;
    let active = true;
    void getCronSchedules(projectId, environment.id)
      .then((items) => {
        if (active) setSchedules(items.map((item) => item.cron));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [environment, projectId]);
  if (!project) return <MissingProject />;
  const save = (next: string[]) => {
    if (!environment) return;
    setSaving(true);
    setError(null);
    void setCronSchedules(project.id, environment.id, next)
      .then(() => setSchedules(next))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Cron schedules could not be saved.'),
      )
      .finally(() => setSaving(false));
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
          <h2>Cron jobs</h2>
          <p>Scheduled invocations managed as Cloudflare cron triggers.</p>
        </div>
      </section>
      <section className="panel cron-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Schedules</span>
            <h2>{schedules.length} active</h2>
          </div>
        </div>
        <div className="cron-form">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="*/5 * * * *"
            aria-label="Cron expression"
          />
          <button
            className="button button--secondary"
            type="button"
            disabled={!draft.trim() || schedules.length >= 5 || saving}
            onClick={() => {
              const next = draft.trim();
              setDraft('');
              if (!next || schedules.includes(next)) return;
              save([...schedules, next]);
            }}
          >
            <Plus size={15} /> Add
          </button>
        </div>
        <div className="cron-list">
          {schedules.map((schedule) => (
            <div className="cron-row" key={schedule}>
              <code>{schedule}</code>
              <button
                className="row-action danger-action"
                type="button"
                aria-label={`Remove ${schedule}`}
                disabled={saving}
                onClick={() => save(schedules.filter((item) => item !== schedule))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {schedules.length === 0 ? (
            <p className="muted-copy">No cron schedules. The Worker still runs over HTTP.</p>
          ) : null}
        </div>
        {error ? <div className="inline-alert">{error}</div> : null}
      </section>
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

type WebVitalMetric = {
  key: keyof WebAnalytics['vitals'];
  code: string;
  label: string;
  unit: 'ms' | 'unitless';
  good: number;
  poor: number;
};

const WEB_VITALS: readonly WebVitalMetric[] = [
  {
    key: 'lcpP75',
    code: 'LCP',
    label: 'Largest contentful paint',
    unit: 'ms',
    good: 2500,
    poor: 4000,
  },
  {
    key: 'inpP75',
    code: 'INP',
    label: 'Interaction to next paint',
    unit: 'ms',
    good: 200,
    poor: 500,
  },
  {
    key: 'clsP75',
    code: 'CLS',
    label: 'Cumulative layout shift',
    unit: 'unitless',
    good: 0.1,
    poor: 0.25,
  },
  {
    key: 'fcpP75',
    code: 'FCP',
    label: 'First contentful paint',
    unit: 'ms',
    good: 1800,
    poor: 3000,
  },
  { key: 'ttfbP75', code: 'TTFB', label: 'Time to first byte', unit: 'ms', good: 800, poor: 1800 },
];

const VITAL_RATING_LABELS = {
  good: 'Good',
  fair: 'Needs improvement',
  poor: 'Poor',
} as const;

function hasWebAnalyticsData(data: WebAnalytics): boolean {
  return (
    data.pageViews > 0 ||
    data.visits > 0 ||
    data.topPaths.length > 0 ||
    Object.values(data.vitals).some((value) => value !== null)
  );
}

function vitalRating(value: number, good: number, poor: number): keyof typeof VITAL_RATING_LABELS {
  if (value <= good) return 'good';
  if (value < poor) return 'fair';
  return 'poor';
}

function vitalPosition(value: number, poor: number): number {
  return Math.min(Math.max(value / poor, 0), 1) * 100;
}

function formatVital(value: number, unit: WebVitalMetric['unit']): string {
  if (unit === 'unitless') return value.toFixed(2);
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function WebVitalsRail({ vitals }: { vitals: WebAnalytics['vitals'] }): React.JSX.Element {
  return (
    <div className="vitals-block">
      <h3 className="web-analytics-subhead">
        Core Web Vitals <span>p75 · field data</span>
      </h3>
      <ol className="vitals-rail">
        {WEB_VITALS.map((metric) => {
          const value = vitals[metric.key];
          if (value === null) {
            return (
              <li key={metric.key} className="vital-row vital-row--idle">
                <span className="vital-label">
                  <strong>{metric.code}</strong>
                  <small>{metric.label}</small>
                </span>
                <span className="vital-track">
                  <i />
                </span>
                <span className="vital-value">—</span>
              </li>
            );
          }
          const rating = vitalRating(value, metric.good, metric.poor);
          return (
            <li
              key={metric.key}
              className={`vital-row vital-row--${rating}`}
              aria-label={`${metric.code}, ${formatVital(value, metric.unit)}, ${VITAL_RATING_LABELS[rating]}`}
            >
              <span className="vital-label">
                <strong>{metric.code}</strong>
                <small>{metric.label}</small>
              </span>
              <span className="vital-track">
                <i style={{ left: `${vitalPosition(value, metric.poor)}%` }} />
              </span>
              <span className="vital-value">{formatVital(value, metric.unit)}</span>
            </li>
          );
        })}
      </ol>
      <div className="vitals-legend" aria-hidden="true">
        <span>
          <i className="legend-dot legend-dot--good" />
          Good
        </span>
        <span>
          <i className="legend-dot legend-dot--fair" />
          Needs improvement
        </span>
        <span>
          <i className="legend-dot legend-dot--poor" />
          Poor
        </span>
      </div>
    </div>
  );
}

function WebAnalyticsTopPaths({
  paths,
  total,
}: {
  paths: WebAnalytics['topPaths'];
  total: number;
}): React.JSX.Element {
  return (
    <div className="top-paths-block">
      <h3 className="web-analytics-subhead">
        Top paths <span>by page views</span>
      </h3>
      {paths.length === 0 ? (
        <p className="muted-copy">No path breakdown in this window.</p>
      ) : (
        <ol className="top-paths-list">
          {paths.map((entry) => (
            <li key={entry.path}>
              <code>{entry.path}</code>
              <span className="path-bar">
                <i style={{ width: `${total === 0 ? 0 : (entry.pageViews / total) * 100}%` }} />
              </span>
              <strong>{compactNumber(entry.pageViews)}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
