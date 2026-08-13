import type { DashboardSummary } from '@workerdeck/contracts';
import { AlertCircle, Github, Rocket } from '../components/icon';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { relativeTime, titleCase } from '../lib/format';

export function ProjectsPage({
  summary,
  onDeploy,
}: {
  summary: DashboardSummary | null;
  onDeploy: (projectId: string, environmentId: string) => Promise<void>;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [deployingProject, setDeployingProject] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const projects =
    summary?.projects.filter((project) => {
      const haystack =
        `${project.name} ${project.repositoryOwner ?? ''} ${project.repositoryName ?? ''}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    }) ?? [];

  return (
    <div className="standard-page">
      <section className="page-intro page-intro--compact">
        <div>
          <span className="eyebrow">Applications</span>
          <h1>Projects</h1>
          <p>Repositories, environments, and their Cloudflare runtime targets.</p>
        </div>
      </section>
      <section className="panel catalog-panel">
        {deployError ? (
          <div className="catalog-alert" role="alert">
            <AlertCircle size={16} />
            <span>{deployError}</span>
            <button type="button" onClick={() => setDeployError(null)}>
              Dismiss
            </button>
          </div>
        ) : null}
        <div className="catalog-toolbar">
          <span>{projects.length} projects</span>
          <input
            type="search"
            placeholder="Filter projects"
            aria-label="Filter projects"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="project-catalog">
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="project-card-top">
                <span className="project-monogram">{project.name.slice(0, 2).toUpperCase()}</span>
                <span className={`project-health project-health--${project.status}`}>
                  {titleCase(project.status)}
                </span>
              </div>
              <div>
                <h2>
                  <Link to={`/projects/${project.id}`}>{project.name}</Link>
                </h2>
                <p>{project.description ?? 'No description provided.'}</p>
              </div>
              <div className="project-card-meta">
                <span>
                  <Github size={14} />
                  {project.repositoryOwner}/{project.repositoryName}
                </span>
                <span>{titleCase(project.framework)}</span>
              </div>
              <div className="project-card-footer">
                <span>Updated {relativeTime(project.updatedAt)}</span>
                <button
                  className="project-deploy"
                  type="button"
                  disabled={
                    deployingProject === project.id ||
                    Boolean(
                      summary?.deployments.some(
                        (deployment) =>
                          deployment.projectId === project.id &&
                          ['queued', 'building', 'deploying'].includes(deployment.status),
                      ),
                    )
                  }
                  onClick={() => {
                    const environment = summary?.environments.find(
                      (candidate) =>
                        candidate.projectId === project.id && candidate.kind === 'production',
                    );
                    if (!environment) {
                      setDeployError(`${project.name} does not have a production environment.`);
                      return;
                    }
                    setDeployingProject(project.id);
                    setDeployError(null);
                    void onDeploy(project.id, environment.id)
                      .catch((error: unknown) => {
                        setDeployError(
                          error instanceof Error
                            ? error.message
                            : 'The deployment could not start.',
                        );
                      })
                      .finally(() => setDeployingProject(null));
                  }}
                >
                  <Rocket size={13} />
                  {deployingProject === project.id ||
                  summary?.deployments.some(
                    (deployment) =>
                      deployment.projectId === project.id &&
                      ['queued', 'building', 'deploying'].includes(deployment.status),
                  )
                    ? 'Deploying…'
                    : summary?.deployments.some((deployment) => deployment.projectId === project.id)
                      ? 'Redeploy'
                      : 'Deploy'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
