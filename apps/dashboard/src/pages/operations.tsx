import type {
  DashboardSummary,
  RecoveryPosture,
  UsageSummary,
  WorkerAnalytics,
  WorkerAnalyticsPoint,
} from '@workerdeck/contracts';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  DatabaseBackup,
  Globe2,
  HardDrive,
  LockKeyhole,
  Plus,
  ServerCog,
  ShieldCheck,
  TimerReset,
} from '../components/icon';
import { useEffect, useState } from 'react';
import {
  ApiError,
  getRecoveryPosture,
  getUsageSummary,
  getWorkerAnalytics,
  isDemoMode,
} from '../lib/api';
import { relativeTime } from '../lib/format';

export function DomainsPage({ summary }: { summary: DashboardSummary | null }): React.JSX.Element {
  const rows = summary?.environments.filter((environment) => environment.url) ?? [];
  return (
    <div className="standard-page">
      <PageHeading
        title="Domains"
        description="Routes, system domains, and certificate posture for deployed applications."
      />
      <section className="operation-strip">
        <OperationStat
          icon={<Globe2 size={18} />}
          value={summary?.resourceCounts.domain ?? 0}
          label="domains"
        />
        <OperationStat icon={<ShieldCheck size={18} />} value="Managed" label="TLS certificates" />
        <OperationStat icon={<Activity size={18} />} value="Global" label="Cloudflare network" />
      </section>
      <div className="operations-grid">
        <section className="panel data-table domains-table">
          <div className="data-row data-row--header">
            <span>Domain</span>
            <span>Project</span>
            <span>Environment</span>
            <span>TLS</span>
            <span>Status</span>
          </div>
          {rows.map((environment) => {
            const project = summary?.projects.find((item) => item.id === environment.projectId);
            return (
              <div className="data-row" key={environment.id}>
                <strong>{new URL(environment.url ?? '').hostname}</strong>
                <span>{project?.name}</span>
                <span className="environment-badge">Production</span>
                <span>
                  <LockKeyhole size={14} /> Auto-managed
                </span>
                <span className="healthy-label">
                  <i /> Active
                </span>
              </div>
            );
          })}
          <div className="table-empty-row">
            Attach custom domains from a project's Domains tab. WorkerDeck checks account-wide
            hostname conflicts before asking Cloudflare to create DNS and TLS.
          </div>
        </section>
        <aside className="panel detail-panel">
          <span className="eyebrow">Routing path</span>
          <div className="routing-path">
            <Globe2 />
            <i />
            <ServerCog />
            <i />
            <span className="project-runtime-mark">W</span>
            <i />
            <ShieldCheck />
          </div>
          <dl className="definition-list">
            <div>
              <dt>System domains</dt>
              <dd>Workers.dev</dd>
            </div>
            <div>
              <dt>Custom domains</dt>
              <dd>{summary?.resourceCounts.domain ?? 0} managed</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>Global</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

export function ObservabilityPage({
  summary,
}: {
  summary: DashboardSummary | null;
}): React.JSX.Element {
  const demo = isDemoMode();
  const [analytics, setAnalytics] = useState<WorkerAnalytics | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void getWorkerAnalytics(1)
      .then((result) => {
        if (active) {
          setAnalytics(result);
          setLoadState('ready');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof ApiError
              ? error.message
              : 'WorkerDeck could not query Workers analytics.',
          );
          setLoadState('error');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="standard-page">
      <PageHeading
        title="Observability"
        description="The last 60 minutes of requests, failures, and CPU across your Worker applications."
      />
      <section className="health-rail">
        {summary?.projects.slice(0, 4).map((project) => {
          const workerName = summary.environments.find(
            (environment) =>
              environment.projectId === project.id && environment.kind === 'production',
          )?.workerName;
          const projectAnalytics = analytics?.projects.find(
            (item) => item.workerName === workerName,
          );
          const degraded = Boolean(projectAnalytics?.errors);
          return (
            <div key={project.id}>
              <span>
                {degraded ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                {project.name}
              </span>
              <small>
                {projectAnalytics
                  ? `${degraded ? 'Needs attention' : 'Healthy'} · ${formatNumber(projectAnalytics.requests)} requests`
                  : project.status === 'active'
                    ? 'Awaiting traffic'
                    : `Project ${project.status}`}
              </small>
            </div>
          );
        })}
      </section>
      {loadState === 'loading' ? (
        <OperationalLoading message="Querying Cloudflare Workers analytics…" />
      ) : null}
      {loadState === 'error' ? (
        <OperationalError title="Workers analytics unavailable" message={message} />
      ) : null}
      {loadState === 'ready' && analytics ? (
        analytics.requests > 0 || demo ? (
          <LiveObservability summary={summary} analytics={analytics} demo={demo} />
        ) : (
          <ObservabilityEmpty analytics={analytics} />
        )
      ) : null}
    </div>
  );
}

export function BackupsPage({ summary }: { summary: DashboardSummary | null }): React.JSX.Element {
  const [posture, setPosture] = useState<RecoveryPosture | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void getRecoveryPosture()
      .then((result) => {
        if (active) {
          setPosture(result);
          setLoadState('ready');
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof ApiError
              ? error.message
              : 'WorkerDeck could not verify D1 recovery bookmarks.',
          );
          setLoadState('error');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const verified = posture?.resources.filter((resource) => resource.status === 'verified') ?? [];
  return (
    <div className="standard-page">
      <PageHeading
        title="Backups"
        description="Verified recovery posture for WorkerDeck-owned D1 databases."
      />
      <section className="operation-strip">
        <OperationStat
          icon={<DatabaseBackup size={18} />}
          value={posture?.resources.length ?? summary?.resourceCounts.d1 ?? 0}
          label="owned D1 databases"
        />
        <OperationStat
          icon={<ShieldCheck size={18} />}
          value={`${verified.length} verified`}
          label="restorable bookmarks"
        />
        <OperationStat
          icon={<HardDrive size={18} />}
          value="7–30 days"
          label="Time Travel retention"
        />
        <OperationStat icon={<TimerReset size={18} />} value="In-place only" label="restore mode" />
      </section>
      <div className="operations-grid">
        <section className="panel backup-list">
          <div className="section-heading">
            <h2>Recovery status</h2>
          </div>
          {loadState === 'loading' ? (
            <div className="table-empty-row">Verifying recovery…</div>
          ) : null}
          {loadState === 'error' ? <div className="table-empty-row">{message}</div> : null}
          {loadState === 'ready' && posture?.resources.length === 0 ? (
            <div className="table-empty-row">
              Create a WorkerDeck-owned D1 database before verifying Time Travel recovery.
            </div>
          ) : null}
          {posture?.resources.map((resource) => (
            <div className="backup-row" key={resource.resourceId}>
              <Database size={17} />
              <strong>{resource.name}</strong>
              <span>D1</span>
              <span>{resource.status === 'verified' ? 'Time Travel' : 'Unavailable'}</span>
              <small>{relativeTime(resource.verifiedAt)}</small>
              <span className={resource.status === 'verified' ? 'healthy-label' : 'warning-label'}>
                {resource.status === 'verified' ? 'Verified' : 'Needs attention'}
              </span>
            </div>
          ))}
        </section>
        <aside className="panel detail-panel">
          <span className="eyebrow">Recovery posture</span>
          <h2>Verified, never implied</h2>
          <p>
            WorkerDeck verifies current and historical D1 Time Travel bookmarks. Cloudflare restore
            overwrites the database in place today, so the dashboard deliberately keeps restore
            disabled until an explicit destructive confirmation and binding-aware recovery flow is
            available.
          </p>
          <button className="button" type="button" disabled>
            Destructive restore locked
          </button>
          <div className="check-list">
            <span>
              <CheckCircle2 size={15} /> Only WorkerDeck-owned D1 resources
            </span>
            <span>
              <CheckCircle2 size={15} /> Bookmark verification is read-only
            </span>
            <span>
              <AlertTriangle size={15} /> Clone restore is not yet supported by Cloudflare
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function UsagePage({ summary }: { summary: DashboardSummary | null }): React.JSX.Element {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void getUsageSummary(24)
      .then((result) => {
        if (active) setUsage(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof ApiError ? error.message : 'WorkerDeck could not query account usage.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="standard-page narrow-page">
      <PageHeading
        title="Usage"
        description="Verified Cloudflare runtime activity and WorkerDeck-owned resource capacity."
      />
      <section className="panel usage-summary">
        <span className="eyebrow">Last 24 hours</span>
        <h2>{summary?.account.name ?? 'Cloudflare account'}</h2>
        <p>
          Workers requests and CPU quantiles come from Cloudflare's sampled GraphQL Analytics
          dataset. Resource counts come from WorkerDeck's ownership ledger.
        </p>
        {message ? <div className="inline-alert">{message}</div> : null}
        <div className="usage-metrics">
          <Metric label="Requests" value={formatNumber(usage?.analytics.requests ?? 0)} />
          <Metric label="Errors" value={formatPercent(usage?.analytics.errorRate ?? 0)} />
          <Metric label="CPU p99" value={formatDuration(usage?.analytics.cpuTimeP99)} />
          <Metric label="Build limit" value={formatBuildLimit(usage)} />
        </div>
        {[
          ['Workers', summary?.resourceCounts.worker ?? 0],
          ['D1 databases', summary?.resourceCounts.d1 ?? 0],
          ['KV namespaces', summary?.resourceCounts.kv ?? 0],
          ['R2 buckets', summary?.resourceCounts.r2 ?? 0],
        ].map(([label, value]) => (
          <div className="usage-row" key={String(label)}>
            <span>
              <strong>{label}</strong>
              <small>{value} managed by WorkerDeck</small>
            </span>
            <strong className="usage-count">{value}</strong>
          </div>
        ))}
      </section>
    </div>
  );
}

function LiveObservability({
  summary,
  analytics,
  demo,
}: {
  summary: DashboardSummary | null;
  analytics: WorkerAnalytics;
  demo: boolean;
}): React.JSX.Element {
  const maxErrors = Math.max(...analytics.projects.map((project) => project.errors), 1);
  return (
    <div className="observability-grid">
      <section className="panel requests-panel">
        <div className="section-heading observability-heading">
          <h2>Requests and CPU</h2>
          <span className="chart-kpis">
            <strong>
              {formatNumber(analytics.requests)}
              <small>requests</small>
            </strong>
            <strong>
              {formatPercent(analytics.errorRate)}
              <small>errors</small>
            </strong>
            <strong>
              {formatDuration(analytics.cpuTimeP99)}
              <small>CPU p99</small>
            </strong>
          </span>
        </div>
        <AnalyticsChart points={analytics.points} />
        <div className="chart-footnote">
          <span>{new Date(analytics.from).toLocaleString()}</span>
          <span>Cloudflare adaptive sampling</span>
          <span>{new Date(analytics.to).toLocaleString()}</span>
        </div>
      </section>
      <section className="panel error-panel">
        <div className="section-heading">
          <h2>Errors by project</h2>
        </div>
        {analytics.projects.map((project) => {
          const projectName = summary?.projects.find((item) =>
            summary.environments.some(
              (environment) =>
                environment.projectId === item.id && environment.workerName === project.workerName,
            ),
          )?.name;
          return (
            <div className="error-bar" key={project.workerName}>
              <span>{projectName ?? project.workerName}</span>
              <progress max={maxErrors} value={project.errors} />
              <strong>{formatNumber(project.errors)}</strong>
            </div>
          );
        })}
      </section>
      <section className="panel live-requests">
        <div className="section-heading">
          <h2>Runtime posture</h2>
          <span className="healthy-label">
            <i /> {demo ? 'Demo dataset' : 'Provider verified'}
          </span>
        </div>
        {analytics.projects.map((project) => (
          <div className="request-row runtime-row" key={project.workerName}>
            <code>{project.errors > 0 ? 'ATTN' : 'OK'}</code>
            <strong>{project.workerName}</strong>
            <span>{formatNumber(project.requests)} requests</span>
            <small>{formatDuration(project.cpuTimeP99)} p99</small>
          </div>
        ))}
      </section>
    </div>
  );
}

function ObservabilityEmpty({ analytics }: { analytics: WorkerAnalytics }): React.JSX.Element {
  return (
    <section className="panel integration-state">
      <span className="integration-state-icon">
        <Activity size={24} />
      </span>
      <div>
        <span className="eyebrow">Cloudflare Analytics connected</span>
        <h2>No Worker invocations in this window</h2>
        <p>
          The provider query completed successfully, but the managed Workers have no sampled request
          rows between {new Date(analytics.from).toLocaleString()} and{' '}
          {new Date(analytics.to).toLocaleString()}.
        </p>
      </div>
    </section>
  );
}

function OperationalLoading({ message }: { message: string }): React.JSX.Element {
  return (
    <section className="panel operational-state">
      <Activity size={23} />
      <strong>{message}</strong>
    </section>
  );
}

function OperationalError({
  title,
  message,
}: {
  title: string;
  message: string;
}): React.JSX.Element {
  return (
    <section className="panel operational-state operational-state--error">
      <AlertTriangle size={23} />
      <span>
        <strong>{title}</strong>
        <small>{message}</small>
      </span>
    </section>
  );
}

function AnalyticsChart({ points }: { points: WorkerAnalyticsPoint[] }): React.JSX.Element {
  const width = 850;
  const height = 230;
  const padding = 12;
  const requestMax = Math.max(...points.map((point) => point.requests), 1);
  const cpuMax = Math.max(...points.map((point) => point.cpuTimeP99 ?? 0), 1);
  const path = (selector: (point: WorkerAnalyticsPoint) => number, max: number) =>
    points
      .map((point, index) => {
        const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
        const y = height - padding - (selector(point) / max) * (height - padding * 2);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  return (
    <svg
      className="request-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label="Cloudflare request volume and CPU p99"
    >
      <path className="chart-grid" d="M0 45H850M0 100H850M0 155H850M0 210H850" />
      {points.length > 0 ? (
        <path className="request-line" d={path((point) => point.requests, requestMax)} />
      ) : null}
      {points.length > 0 ? (
        <path className="latency-line" d={path((point) => point.cpuTimeP99 ?? 0, cpuMax)} />
      ) : null}
    </svg>
  );
}

function OperationStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}): React.JSX.Element {
  return (
    <div>
      {icon}
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: string;
}): React.JSX.Element {
  return (
    <section className="page-intro page-intro--compact">
      <div>
        <span className="eyebrow">Cloudflare operations</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? (
        <button className="button button--primary" type="button">
          <Plus size={16} />
          {action}
        </button>
      ) : null}
    </section>
  );
}

function formatNumber(value: number): string {
  return Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number): string {
  return Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(value);
}

function formatDuration(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : `${Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}ms`;
}

function formatBuildLimit(usage: UsageSummary | null): string {
  if (!usage || usage.builds.limitReached === null) return 'Unreported';
  return usage.builds.limitReached ? 'Reached' : 'Available';
}
