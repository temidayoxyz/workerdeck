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
} from 'lucide-react';
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
};

export interface ShellContext {
  summary: DashboardSummary | null;
  projectCreated: (project: Project) => void;
}

interface AppShellProps {
  summary: DashboardSummary | null;
  onProjectCreated: (project: Project) => void;
}

export function AppShell({ summary, onProjectCreated }: AppShellProps): React.JSX.Element {
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
          <span className="profile-avatar">AO</span>
          <span>
            <strong>Account owner</strong>
            <small>{summary?.account.connected ? 'Connected' : 'Setup required'}</small>
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
          <Outlet context={{ summary, projectCreated: onProjectCreated } satisfies ShellContext} />
        </div>
      </main>

      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} summary={summary} />
    </div>
  );
}
