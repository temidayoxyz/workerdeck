import type { Environment, Project } from '@workerdeck/contracts';
import { GitBranch, Rocket } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { BrandMark } from './brand';

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
        <button className="button button--primary" type="button" onClick={onDeploy}>
          <Rocket size={16} />
          Deploy
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
