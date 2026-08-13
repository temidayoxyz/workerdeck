import type { DashboardSummary } from '@workerdeck/contracts';
import { Boxes, Gauge, LayoutGrid, Rocket, Search, Settings, X } from './icon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface CommandMenuProps {
  open: boolean;
  onClose: () => void;
  summary: DashboardSummary | null;
}

const destinations = [
  { label: 'Overview', description: 'Account health and recent activity', to: '/', icon: Gauge },
  {
    label: 'Projects',
    description: 'Repositories and environments',
    to: '/projects',
    icon: LayoutGrid,
  },
  {
    label: 'Deployments',
    description: 'Builds, versions, and release history',
    to: '/deployments',
    icon: Rocket,
  },
  {
    label: 'Resources',
    description: 'Managed Cloudflare inventory',
    to: '/resources',
    icon: Boxes,
  },
  {
    label: 'Settings',
    description: 'Account access and safeguards',
    to: '/settings',
    icon: Settings,
  },
];

export function CommandMenu({ open, onClose, summary }: CommandMenuProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const options = useMemo(() => {
    const pages = destinations.map((destination) => ({ ...destination, group: 'Navigate' }));
    const projects =
      summary?.projects.map((project) => ({
        label: project.name,
        description: [project.repositoryOwner, project.repositoryName].filter(Boolean).join('/'),
        to: `/projects/${project.id}`,
        icon: LayoutGrid,
        group: 'Projects',
      })) ?? [];
    const normalizedQuery = query.trim().toLowerCase();
    return [...pages, ...projects].filter((option) =>
      `${option.label} ${option.description}`.toLowerCase().includes(normalizedQuery),
    );
  }, [query, summary]);

  const select = (to: string) => {
    void navigate(to);
    setQuery('');
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="command-dialog"
      onCancel={onClose}
      onClose={() => {
        setQuery('');
        onClose();
      }}
    >
      <div className="command-search">
        <Search size={17} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && options[0]) select(options[0].to);
          }}
          placeholder="Find a page or project"
          aria-label="Find a page or project"
        />
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close command menu"
        >
          <X size={17} />
        </button>
      </div>
      <div className="command-results" role="listbox" aria-label="WorkerDeck destinations">
        {options.map((option) => (
          <button
            key={`${option.group}-${option.label}`}
            type="button"
            role="option"
            aria-selected="false"
            onClick={() => select(option.to)}
          >
            <span className="command-result-icon">
              <option.icon size={16} />
            </span>
            <span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            <kbd>Enter</kbd>
          </button>
        ))}
        {options.length === 0 ? (
          <p className="command-empty">No matching pages or projects.</p>
        ) : null}
      </div>
    </dialog>
  );
}
