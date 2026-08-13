import type { DashboardSummary, Deployment, Environment, Project } from '@workerdeck/contracts';
import {
  ArrowRight,
  Box,
  CloudCog,
  Database,
  ExternalLink,
  GitCommitHorizontal,
  Plus,
  RefreshCw,
} from '../components/icon';
import { Link, useNavigate } from 'react-router-dom';
import { DeploymentRail } from '../components/deployment-rail';
import { DeploymentStatus } from '../components/status';
import { relativeTime, shortSha, titleCase } from '../lib/format';

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
  const readyCount = summary.deployments.filter(
    (deployment) => deployment.status === 'ready',
  ).length;
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

      <section className="metric-strip" aria-label="Account metrics">
        <div>
          <span>Projects</span>
          <strong>{summary.projects.length}</strong>
          <small>managed applications</small>
        </div>
        <div>
          <span>Healthy releases</span>
          <strong>{readyCount}</strong>
          <small>recent deployments</small>
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
              <p className="muted-copy">
                The first deployment rail will appear here after you import a repository.
              </p>
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
                <span />
              </div>
              {summary.projects.map((project) => {
                const environment = summary.environments.find(
                  (candidate) =>
                    candidate.projectId === project.id && candidate.kind === 'production',
                );
                return (
                  <div className="project-row" role="row" key={project.id}>
                    <span className="project-name">
                      <span className="project-monogram">
                        {project.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <strong>{project.name}</strong>
                        <small>
                          {project.repositoryOwner}/{project.repositoryName}
                        </small>
                      </span>
                    </span>
                    <span>
                      <span className="framework-label">{titleCase(project.framework)}</span>
                    </span>
                    <span className="production-link">
                      {environment?.url ? (
                        <>
                          <span className="live-dot" />
                          Live
                        </>
                      ) : (
                        <span className="muted-copy">Not deployed</span>
                      )}
                    </span>
                    <span className="muted-copy">{relativeTime(project.updatedAt)}</span>
                    <span>
                      <Link
                        className="row-action"
                        to={`/projects/${project.id}`}
                        aria-label={`Open ${project.name}`}
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </span>
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
                <p className="muted-copy">No deployment activity yet.</p>
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
