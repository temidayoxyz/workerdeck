import type { DashboardSummary, Project } from '@workerdeck/contracts';
import {
  Activity,
  Boxes,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  DatabaseBackup,
  DoubleAltArrowLeft,
  Gauge,
  Globe2,
  LayoutGrid,
  Mail,
  Menu,
  Plus,
  Rocket,
  Search,
  Settings,
  ThemeHalf,
  Users,
  X,
} from './icon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { Brand } from './brand';
import { CommandMenu } from './command-menu';

const navigationGroups = [
  {
    label: 'Main',
    items: [
      { label: 'Home', to: '/', icon: Gauge },
      { label: 'Projects', to: '/projects', icon: LayoutGrid },
      { label: 'Deployments', to: '/deployments', icon: Rocket },
      { label: 'Monitoring & logs', to: '/observability', icon: Activity },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { label: 'Resources & services', to: '/resources', icon: Boxes, badge: 'resources' },
      { label: 'Domains', to: '/domains', icon: Globe2 },
      { label: 'Email', to: '/email', icon: Mail },
      { label: 'Backups', to: '/backups', icon: DatabaseBackup },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Team & access', to: '/team', icon: Users },
      { label: 'Usage', to: '/usage', icon: ChartNoAxesColumnIncreasing },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
] as const;

const pageNames: Record<string, string> = {
  '/': 'Overview',
  '/projects': 'Projects',
  '/projects/new': 'New project',
  '/deployments': 'Deployments',
  '/resources': 'Resources',
  '/domains': 'Domains',
  '/email': 'Email',
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
  const [compactNavigation, setCompactNavigation] = useState(
    () => window.matchMedia('(max-width: 1024px)').matches,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem('workerdeck-sidebar') === 'collapsed',
  );
  const [themeMode, resolvedTheme, toggleTheme] = useTheme();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const navWasOpen = useRef(false);
  const initialLocationKey = useRef<string | null>(null);
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

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');
    const update = () => setCompactNavigation(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (navOpen) drawerCloseRef.current?.focus();
    else if (navWasOpen.current) menuButtonRef.current?.focus();
    navWasOpen.current = navOpen;
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
  const resourceCount = summary
    ? Object.values(summary.resourceCounts).reduce((total, count) => total + count, 0)
    : 0;
  const nextTheme = resolvedTheme === 'light' ? 'dark' : 'light';
  if (initialLocationKey.current === null) initialLocationKey.current = location.key;
  const animateRoute = location.key !== initialLocationKey.current;

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('workerdeck-sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  };

  return (
    <div className={`app-shell${sidebarCollapsed ? ' app-shell--collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div
        className={`sidebar-scrim${navOpen ? ' sidebar-scrim--open' : ''}`}
        aria-hidden="true"
        onClick={closeNavigation}
      />
      <aside
        className={`sidebar${navOpen ? ' sidebar--open' : ''}`}
        id="app-navigation"
        inert={(compactNavigation && !navOpen) || undefined}
        aria-hidden={compactNavigation && !navOpen ? true : undefined}
      >
        <div className="sidebar-brand">
          <Brand />
          <span className="version-badge">v0.1</span>
          <button
            className="sidebar-collapse"
            type="button"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleSidebar}
          >
            <DoubleAltArrowLeft size={17} />
          </button>
          <button
            ref={drawerCloseRef}
            className="topbar-icon drawer-close"
            type="button"
            aria-label="Close navigation"
            onClick={closeNavigation}
          >
            <X size={18} />
          </button>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(({ label, to, icon: Icon, ...item }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  aria-label={label}
                  title={sidebarCollapsed ? label : undefined}
                  onClick={closeNavigation}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{label}</span>
                  {'badge' in item && resourceCount > 0 ? (
                    <b className="nav-count">{resourceCount}</b>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <nav className="secondary-nav" aria-label="Account navigation">
          <button
            className="sidebar-new-project"
            type="button"
            onClick={() => void navigate('/projects/new')}
          >
            <Plus size={17} />
            <span>New project</span>
          </button>
          <a
            href="https://github.com/temidayoxyz/workerdeck"
            target="_blank"
            rel="noreferrer"
            title={sidebarCollapsed ? 'Documentation' : undefined}
          >
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

      <main className="main-area" id="main-content" inert={navOpen || undefined}>
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
              <Search size={16} />
              <span>Search projects, deployments…</span>
              <kbd>⌘K</kbd>
            </button>
            <button
              className="topbar-icon"
              type="button"
              onClick={toggleTheme}
              aria-label={`Theme: ${themeMode}. Switch to ${nextTheme} theme`}
              title={`Theme: ${themeMode}. Switch to ${nextTheme}`}
            >
              <ThemeHalf size={18} />
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
              ref={menuButtonRef}
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
          <div
            className={`page-route${animateRoute ? ' page-route--enter' : ''}`}
            key={location.key}
          >
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
