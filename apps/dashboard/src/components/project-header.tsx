import type { Environment, Project } from '@workerdeck/contracts';
import { NavLink, useOutletContext } from 'react-router-dom';
import type { ShellContext } from './app-shell';
import { BrandMark } from './brand';
import { GitBranch, Rocket } from './icon';

const tabs = [
  { label: 'Overview', path: '' },
  { label: 'Deployments', path: '/deployments' },
  { label: 'Logs', path: '/logs' },
  { label: 'Resources', path: '/resources' },
  { label: 'Domains', path: '/domains' },
  { label: 'Variables', path: '/variables' },
  { label: 'Settings', path: '/settings' },
];

export function ProjectHeader({
  project,
  environment,
  onDeploy,
}: {
  project: Project;
  environment: Environment | undefined;
  onDeploy: () => void;
}): React.JSX.Element {
  const base = `/projects/${project.id}`;
  const { summary } = useOutletContext<ShellContext>();
  const latestDeployment = summary?.deployments.find(
    (deployment) => deployment.projectId === project.id,
  );
  const deploymentActive = Boolean(
    latestDeployment && ['queued', 'building', 'deploying'].includes(latestDeployment.status),
  );
  return (
    <>
      <header className="project-header">
        <span className="project-runtime-mark">
          <BrandMark className="project-brand-mark" />
        </span>
        <div className="project-identity">
          <div>
            <h1>{project.name}</h1>
            <span className="environment-badge">Production</span>
            <span className="health-badge">
              <i /> Healthy
            </span>
          </div>
          <p>
            {project.repositoryOwner}/{project.repositoryName}
            <span>·</span>
            <GitBranch size={14} />
            {project.productionBranch}
          </p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={onDeploy}
          disabled={deploymentActive}
        >
          <Rocket size={16} />
          {deploymentActive ? 'Deploying…' : latestDeployment ? 'Redeploy' : 'Deploy'}
        </button>
      </header>
      <nav className="project-tabs" aria-label={`${project.name} navigation`}>
        {tabs.map((tab) => (
          <NavLink key={tab.path} to={`${base}${tab.path}`} end={tab.path === ''}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {environment?.url ? (
        <div className="project-route-bar">
          <span>
            <i /> System domain
          </span>
          <a href={environment.url} target="_blank" rel="noreferrer">
            {environment.url}
          </a>
          <span className="route-status">
            <i /> Global
          </span>
        </div>
      ) : null}
    </>
  );
}
