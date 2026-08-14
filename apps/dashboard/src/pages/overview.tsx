import type { DashboardSummary, Deployment, Environment, Project } from '@workerdeck/contracts';
import {
  AlertCircle,
  ArrowRight,
  Box,
  CloudCog,
  Database,
  ExternalLink,
  GitCommitHorizontal,
  Plus,
  RefreshCw,
  Rocket,
} from '../components/icon';
import { Link, useNavigate } from 'react-router-dom';
import { DeploymentRail } from '../components/deployment-rail';
import { DeploymentStatus } from '../components/status';
import { relativeTime, shortSha, titleCase } from '../lib/format';
import { projectReleaseState } from '../lib/project-release';

interface OverviewPageProps {
  summary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function projectFor(projects: Project[], deployment: Deployment): Project | undefined {
  return projects.find((project) => project.id === deployment.projectId);
}

function environmentFor(
  environments: Environment[],
  deployment: Deployment,
): Environment | undefined {
  return environments.find((environment) => environment.id === deployment.environmentId);
}

export function OverviewPage({
  summary,
  loading,
  error,
  onRetry,
}: OverviewPageProps): React.JSX.Element {
  const navigate = useNavigate();
  if (loading) return <OverviewSkeleton />;
  if (error) {
    return (
      <div className="state-panel state-panel--error">
        <CloudCog size={24} />
        <h1>The control plane did not respond</h1>
        <p>{error}</p>
        <button className="button button--secondary" type="button" onClick={onRetry}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  }
  if (!summary) return <></>;

  const latest = summary.deployments[0];
  const liveCount = summary.projects.filter((project) => {
    const state = projectReleaseState(project.id, summary.environments, summary.deployments);
    return state.label === 'Live' || state.label.startsWith('Live ·');
  }).length;
  const resourceTotal = Object.values(summary.resourceCounts).reduce(
    (total, count) => total + count,
    0,
  );

  return (
    <div className="overview-page">
      <section className="page-intro">
        <div>
          <span className="eyebrow">Account overview</span>
          <h1>Good morning.</h1>
          <p>Your Cloudflare applications, releases, and owned resources in one place.</p>
        </div>
        <div
          className={`connection-state ${summary.account.connected ? 'connection-state--connected' : ''}`}
        >
          <span aria-hidden="true" />
          {summary.account.connected ? 'Cloudflare connected' : 'Cloudflare not connected'}
        </div>
      </section>

      {summary.sync && summary.sync.status !== 'ok' ? (
        <div className={`sync-alert sync-alert--${summary.sync.status}`} role="status">
          <AlertCircle size={17} />
          <span>
            <strong>
              {summary.sync.status === 'disconnected'
                ? 'Cloudflare sync is paused'
                : 'Some projects need attention'}
            </strong>
            <small>
              {summary.sync.message ?? 'Build reconciliation reported a provider problem.'}
            </small>
          </span>
        </div>
      ) : null}

      <section className="metric-strip" aria-label="Account metrics">
        <div>
          <span>Projects</span>
          <strong>{summary.projects.length}</strong>
          <small>managed applications</small>
        </div>
        <div>
          <span>Live applications</span>
          <strong>{liveCount}</strong>
          <small>serving production traffic</small>
        </div>
        <div>
          <span>Resources</span>
          <strong>{resourceTotal}</strong>
          <small>in ownership ledger</small>
        </div>
        <div>
          <span>Plan</span>
          <strong className="metric-word">{titleCase(summary.account.plan)}</strong>
          <small>Cloudflare account</small>
        </div>
      </section>

      {summary.projects.length === 0 ? (
        <EmptyOverview onImport={() => void navigate('/projects/new')} />
      ) : (
        <div className="overview-grid">
          <section className="panel panel--wide latest-deployment">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Latest deployment</span>
                <h2>
                  {latest ? projectFor(summary.projects, latest)?.name : 'No deployments yet'}
                </h2>
              </div>
              {latest ? <DeploymentStatus status={latest.status} /> : null}
            </div>
            {latest ? (
              <>
                <div className="deployment-meta">
                  <span>
                    <GitCommitHorizontal size={15} />
                    <code>{shortSha(latest.gitCommitSha)}</code>
                    {latest.gitCommitMessage ?? 'Manual deployment'}
                  </span>
                  <span>{environmentFor(summary.environments, latest)?.name ?? 'Production'}</span>
                  <span>{relativeTime(latest.createdAt)}</span>
                </div>
                <DeploymentRail
                  deployment={latest}
                  production={environmentFor(summary.environments, latest)?.kind === 'production'}
                />
                <div className="panel-footer">
                  <Link className="text-button" to="/deployments">
                    Open deployment <ArrowRight size={15} />
                  </Link>
                </div>
              </>
            ) : (
              <div className="panel-empty-state panel-empty-state--deployment">
                <span className="panel-empty-icon">
                  <Rocket size={20} />
                </span>
                <div>
                  <strong>Ready for a first release</strong>
                  <p>
                    Deploy an imported project to create its production Worker and release rail.
                  </p>
                </div>
                <Link className="button button--secondary" to="/projects">
                  Choose a project <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </section>

          <section className="panel resource-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Resource inventory</span>
                <h2>Bound services</h2>
              </div>
              <Box size={18} />
            </div>
            <div className="resource-list">
              <div>
                <span className="resource-icon resource-icon--worker">
                  <CloudCog size={16} />
                </span>
                <span>
                  <strong>Workers</strong>
                  <small>Application compute</small>
                </span>
                <b>{summary.resourceCounts.worker}</b>
              </div>
              <div>
                <span className="resource-icon resource-icon--data">
                  <Database size={16} />
                </span>
                <span>
                  <strong>Data</strong>
                  <small>D1, KV and R2</small>
                </span>
                <b>
                  {summary.resourceCounts.d1 +
                    summary.resourceCounts.kv +
                    summary.resourceCounts.r2}
                </b>
              </div>
              <div>
                <span className="resource-icon resource-icon--edge">
                  <ExternalLink size={16} />
                </span>
                <span>
                  <strong>Domains</strong>
                  <small>Routes and certificates</small>
                </span>
                <b>{summary.resourceCounts.domain}</b>
              </div>
            </div>
            <div className="panel-footer">
              <Link className="text-button" to="/resources">
                View ownership ledger <ArrowRight size={15} />
              </Link>
            </div>
          </section>

          <section className="panel panel--wide projects-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Projects</span>
                <h2>Applications</h2>
              </div>
              <Link className="text-button" to="/projects">
                View all <ArrowRight size={15} />
              </Link>
            </div>
            <div className="project-table" role="table" aria-label="Projects">
              <div className="project-row project-row--header" role="row">
                <span>Project</span>
                <span>Framework</span>
                <span>Production</span>
                <span>Updated</span>
              </div>
              {summary.projects.map((project) => {
                const release = projectReleaseState(
                  project.id,
                  summary.environments,
                  summary.deployments,
                );
                return (
                  <div className="project-row" role="row" key={project.id}>
                    <span className="project-name">
                      <span className="project-monogram">
                        {project.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <strong>
                          <Link to={`/projects/${project.id}`}>{project.name}</Link>
                        </strong>
                        <small>
                          {project.repositoryOwner}/{project.repositoryName}
                        </small>
                      </span>
                    </span>
                    <span>
                      <span className="framework-label">{titleCase(project.framework)}</span>
                    </span>
                    <span className="production-link">
                      {release.label === 'Live' ? (
                        <>
                          <span className="live-dot" />
                          Live
                        </>
                      ) : (
                        <span className={`release-copy release-copy--${release.tone}`}>
                          {release.label}
                        </span>
                      )}
                    </span>
                    <span className="muted-copy">{relativeTime(project.updatedAt)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Recent activity</span>
                <h2>Deployments</h2>
              </div>
            </div>
            <div className="activity-list">
              {summary.deployments.slice(0, 4).map((deployment) => (
                <div className="activity-item" key={deployment.id}>
                  <span className={`activity-marker activity-marker--${deployment.status}`} />
                  <span>
                    <strong>
                      {projectFor(summary.projects, deployment)?.name ?? 'Unknown project'}
                    </strong>
                    <small>
                      <code>{shortSha(deployment.gitCommitSha)}</code> ·{' '}
                      {relativeTime(deployment.createdAt)}
                    </small>
                  </span>
                  <DeploymentStatus status={deployment.status} />
                </div>
              ))}
              {summary.deployments.length === 0 ? (
                <div className="panel-empty-state panel-empty-state--compact">
                  <span className="panel-empty-icon">
                    <GitCommitHorizontal size={18} />
                  </span>
                  <div>
                    <strong>No release activity</strong>
                    <p>Builds and Git commits will appear here.</p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function EmptyOverview({ onImport }: { onImport: () => void }): React.JSX.Element {
  return (
    <section className="empty-workspace">
      <div className="empty-rail" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <span className="eyebrow">First deployment</span>
      <h2>Bring in a repository.</h2>
      <p>
        WorkerDeck will identify its runtime, show every planned resource, and wait for your
        approval before provisioning anything.
      </p>
      <button className="button button--primary" type="button" onClick={onImport}>
        <Plus size={16} />
        Import repository
      </button>
    </section>
  );
}

function OverviewSkeleton(): React.JSX.Element {
  return (
    <div className="overview-page" aria-busy="true" aria-label="Loading dashboard">
      <div className="skeleton skeleton--intro" />
      <div className="skeleton skeleton--metrics" />
      <div className="overview-grid">
        <div className="skeleton skeleton--panel" />
        <div className="skeleton skeleton--panel" />
        <div className="skeleton skeleton--panel" />
        <div className="skeleton skeleton--panel" />
      </div>
    </div>
  );
}
