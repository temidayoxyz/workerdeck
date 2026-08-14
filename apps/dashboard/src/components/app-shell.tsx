import type { DashboardSummary, Project } from '@workerdeck/contracts';
import {
  Activity,
  Bell,
  Boxes,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  CircleHelp,
  Command,
  DatabaseBackup,
  Gauge,
  Globe2,
  LayoutGrid,
  Moon,
  Plus,
  Rocket,
  Settings,
  Sun,
  Users,
} from './icon';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { Brand } from './brand';
import { CommandMenu } from './command-menu';

const primaryNavigation = [
  { label: 'Overview', to: '/', icon: Gauge },
  { label: 'Projects', to: '/projects', icon: LayoutGrid },
  { label: 'Deployments', to: '/deployments', icon: Rocket },
  { label: 'Resources', to: '/resources', icon: Boxes },
  { label: 'Domains', to: '/domains', icon: Globe2 },
  { label: 'Observability', to: '/observability', icon: Activity },
  { label: 'Backups', to: '/backups', icon: DatabaseBackup },
  { label: 'Team', to: '/team', icon: Users },
];

const pageNames: Record<string, string> = {
  '/': 'Overview',
  '/projects': 'Projects',
  '/projects/new': 'New project',
  '/deployments': 'Deployments',
  '/resources': 'Resources',
  '/domains': 'Domains',
  '/observability': 'Observability',
  '/backups': 'Backups',
  '/usage': 'Usage',
  '/settings': 'Settings',
  '/team': 'Team',
};

export interface ShellContext {
  summary: DashboardSummary | null;
  projectCreated: (project: Project) => Promise<void>;
  projectDeleted: (projectId: string, confirmation: string) => Promise<void>;
  deploymentDeleted: (deploymentId: string) => Promise<void>;
}

interface AppShellProps {
  summary: DashboardSummary | null;
  onProjectCreated: (project: Project) => Promise<void>;
  onProjectDeleted: (projectId: string, confirmation: string) => Promise<void>;
  onDeploymentDeleted: (deploymentId: string) => Promise<void>;
}

export function AppShell({
  summary,
  onProjectCreated,
  onProjectDeleted,
  onDeploymentDeleted,
}: AppShellProps): React.JSX.Element {
  const [commandOpen, setCommandOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const project = summary?.projects.find((candidate) =>
    location.pathname.startsWith(`/projects/${candidate.id}`),
  );
  const currentPage = project?.name ?? pageNames[location.pathname] ?? 'WorkerDeck';
  const userEmail = summary?.account.userEmail;
  const userLabel = userEmail
    ? displayNameFromEmail(userEmail)
    : (summary?.account.name ?? 'WorkerDeck');
  const userInitials = initialsFromLabel(userLabel);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <button className="workspace-switcher" type="button">
          <span className="workspace-avatar">WD</span>
          <span>
            <strong>{summary?.account.name ?? 'WorkerDeck'}</strong>
            <small>Cloudflare workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav className="primary-nav" aria-label="Primary navigation">
          {primaryNavigation.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} aria-label={label}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              <i aria-hidden="true" />
            </NavLink>
          ))}
        </nav>
        <nav className="secondary-nav" aria-label="Account navigation">
          <NavLink to="/usage">
            <ChartNoAxesColumnIncreasing size={18} />
            <span>Usage</span>
          </NavLink>
          <NavLink to="/settings">
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
          <a href="https://github.com/temidayoxyz/workerdeck" target="_blank" rel="noreferrer">
            <CircleHelp size={18} />
            <span>Documentation</span>
          </a>
        </nav>
        <div className="sidebar-profile">
          <span className="profile-avatar">{userInitials}</span>
          <span>
            <strong>{userLabel}</strong>
            <small>
              {userEmail ??
                (summary?.account.connected ? 'Cloudflare connected' : 'Local development')}
            </small>
          </span>
          <span className="presence-dot" />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-workspace">{summary?.account.name ?? 'Workspace'}</span>
            <span>/</span>
            <strong>{currentPage}</strong>
          </div>
          <div className="topbar-actions">
            <button className="command-button" type="button" onClick={() => setCommandOpen(true)}>
              <Command size={16} />
              <span>Search projects, deployments…</span>
              <kbd>⌘K</kbd>
            </button>
            <button
              className="topbar-icon"
              type="button"
              onClick={toggleTheme}
              aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="topbar-icon notification-button"
              type="button"
              aria-label="Notifications"
            >
              <Bell size={19} />
              <span />
            </button>
            <button
              className="button button--primary button--compact"
              type="button"
              onClick={() => void navigate('/projects/new')}
            >
              <Plus size={17} />
              New project
            </button>
          </div>
        </header>
        <div className="page-frame">
          <Outlet
            context={
              {
                summary,
                projectCreated: onProjectCreated,
                projectDeleted: onProjectDeleted,
                deploymentDeleted: onDeploymentDeleted,
              } satisfies ShellContext
            }
          />
        </div>
      </main>

      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} summary={summary} />
    </div>
  );
}

function displayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'WD'
  );
}
