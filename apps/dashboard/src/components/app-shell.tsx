import type { DashboardSummary, Project } from '@workerdeck/contracts';
import {
  Activity,
  Boxes,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  Command,
  DatabaseBackup,
  Gauge,
  Globe2,
  LayoutGrid,
  Menu,
  Moon,
  Plus,
  Rocket,
  Settings,
  Sun,
  Users,
  X,
} from './icon';
import { useCallback, useEffect, useState } from 'react';
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
  const [navOpen, setNavOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const closeNavigation = useCallback(() => setNavOpen(false), []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') closeNavigation();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [closeNavigation]);

  // Route changes always close the drawer.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // Lock body scroll only while the drawer is open.
  useEffect(() => {
    document.body.classList.toggle('drawer-open', navOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [navOpen]);

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
      <div
        className={`sidebar-scrim${navOpen ? ' sidebar-scrim--open' : ''}`}
        aria-hidden="true"
        onClick={closeNavigation}
      />
      <aside className={`sidebar${navOpen ? ' sidebar--open' : ''}`} id="app-navigation">
        <div className="sidebar-brand">
          <Brand />
          <button
            className="topbar-icon drawer-close"
            type="button"
            aria-label="Close navigation"
            onClick={closeNavigation}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">WD</span>
          <span>
            <strong>{summary?.account.name ?? 'WorkerDeck'}</strong>
            <small>Cloudflare workspace</small>
          </span>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {primaryNavigation.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} aria-label={label} onClick={closeNavigation}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              <i aria-hidden="true" />
            </NavLink>
          ))}
        </nav>
        <nav className="secondary-nav" aria-label="Account navigation">
          <NavLink to="/usage" onClick={closeNavigation}>
            <ChartNoAxesColumnIncreasing size={18} />
            <span>Usage</span>
          </NavLink>
          <NavLink to="/settings" onClick={closeNavigation}>
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
          <div className="topbar-brand">
            <Brand />
          </div>
          <div className="breadcrumb">
            <span className="breadcrumb-workspace">{summary?.account.name ?? 'Workspace'}</span>
            <span>/</span>
            <strong>{currentPage}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="command-button"
              type="button"
              aria-label="Search projects and deployments"
              onClick={() => setCommandOpen(true)}
            >
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
              className="button button--primary button--compact"
              type="button"
              onClick={() => void navigate('/projects/new')}
            >
              <Plus size={17} />
              New project
            </button>
            <button
              className="topbar-icon menu-button"
              type="button"
              aria-expanded={navOpen}
              aria-controls="app-navigation"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              <Menu size={19} />
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
