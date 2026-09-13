import type { DashboardSummary, ManagedResource, ResourceKind } from '@workerdeck/contracts';
import {
  Archive,
  type Box,
  CloudCog,
  Database,
  DatabaseBackup,
  Globe2,
  HardDrive,
  Inbox,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from '../components/icon';
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
  {
    kind: 'r2',
    label: 'R2 buckets',
    description: 'Objects, artifacts, and exports',
    icon: DatabaseBackup,
  },
  {
    kind: 'domain',
    label: 'Domains',
    description: 'Routes, hostnames, and certificates',
    icon: Globe2,
  },
  {
    kind: 'queue',
    label: 'Queues',
    description: 'Asynchronous producers and consumers',
    icon: Inbox,
  },
  {
    kind: 'workflow',
    label: 'Workflows',
    description: 'Durable deployment operations',
    icon: Workflow,
  },
  {
    kind: 'hyperdrive',
    label: 'Hyperdrive',
    description: 'Postgres bridge with connection pooling',
    icon: HardDrive,
  },
  {
    kind: 'vectorize',
    label: 'Vectorize indexes',
    description: 'Embeddings and semantic search',
    icon: Search,
  },
  {
    kind: 'ai_gateway',
    label: 'Workers AI / AI Gateway',
    description: 'Model access with caching and logs',
    icon: Sparkles,
  },
  {
    kind: 'durable_object',
    label: 'Durable Objects',
    description: 'Adopted stateful object namespaces',
    icon: Layers,
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
        <span className="ownership-note-icon" aria-hidden="true">
          <ShieldCheck size={18} />
        </span>
        <span>
          <strong>Ownership stays explicit</strong>
          <small>
            WorkerDeck changes only resources in its ownership ledger. External Cloudflare resources
            remain visible and are never adopted or deleted automatically.
          </small>
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
