import type { DashboardSummary, ManagedResource, ResourceKind } from '@workerdeck/contracts';
import {
  Archive,
  Box,
  CloudCog,
  Database,
  ExternalLink,
  Network,
  Plus,
  Workflow,
} from 'lucide-react';
import { useState } from 'react';
import { NewResourceDialog } from '../components/new-resource-dialog';

const resources: Array<{
  kind: ResourceKind;
  label: string;
  description: string;
  icon: typeof Box;
}> = [
  {
    kind: 'worker',
    label: 'Workers',
    description: 'Application compute and static assets',
    icon: CloudCog,
  },
  { kind: 'd1', label: 'D1 databases', description: 'Serverless SQL databases', icon: Database },
  {
    kind: 'kv',
    label: 'KV namespaces',
    description: 'Configuration and low-latency reads',
    icon: Archive,
  },
  { kind: 'r2', label: 'R2 buckets', description: 'Objects, artifacts, and exports', icon: Box },
  {
    kind: 'domain',
    label: 'Domains',
    description: 'Routes, hostnames, and certificates',
    icon: ExternalLink,
  },
  {
    kind: 'queue',
    label: 'Queues',
    description: 'Asynchronous producers and consumers',
    icon: Network,
  },
  {
    kind: 'workflow',
    label: 'Workflows',
    description: 'Durable deployment operations',
    icon: Workflow,
  },
];

export function ResourcesPage({
  summary,
  onResourceCreated,
}: {
  summary: DashboardSummary | null;
  onResourceCreated: (resource: ManagedResource) => void;
}): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <div className="standard-page">
      <section className="page-intro page-intro--compact">
        <div>
          <span className="eyebrow">Ownership ledger</span>
          <h1>Resources</h1>
          <p>Cloudflare resources WorkerDeck is authorized to manage.</p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={() => setDialogOpen(true)}
        >
          <Plus size={16} />
          Add resource
        </button>
      </section>
      <div className="resource-catalog">
        {resources.map(({ kind, label, description, icon: Icon }) => (
          <article className="resource-card" key={kind}>
            <span className="resource-card-icon">
              <Icon size={18} />
            </span>
            <span>
              <h2>{label}</h2>
              <p>{description}</p>
            </span>
            <strong>{summary?.resourceCounts[kind] ?? 0}</strong>
          </article>
        ))}
      </div>
      <div className="ownership-note">
        <strong>WorkerDeck only changes what it owns.</strong>
        <span>
          Resources created outside WorkerDeck remain visible in Cloudflare but are never adopted or
          deleted implicitly.
        </span>
      </div>
      <NewResourceDialog
        open={dialogOpen}
        summary={summary}
        onClose={() => setDialogOpen(false)}
        onCreated={onResourceCreated}
      />
    </div>
  );
}
