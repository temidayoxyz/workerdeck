import {
  createResourceInputSchema,
  type DashboardSummary,
  type ManagedResource,
} from '@workerdeck/contracts';
import { AlertCircle, Box, X } from './icon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createResource, getDurableObjectNamespaces } from '../lib/api';

interface DurableObjectNamespace {
  id: string;
  name: string;
  className: string;
  scriptName: string;
}

function formValue(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

interface NewResourceDialogProps {
  open: boolean;
  summary: DashboardSummary | null;
  onClose: () => void;
  onCreated: (resource: ManagedResource) => void;
}

export function NewResourceDialog({
  open,
  summary,
  onClose,
  onCreated,
}: NewResourceDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState('d1');
  const [namespaces, setNamespaces] = useState<DurableObjectNamespace[]>([]);
  const [namespacesLoading, setNamespacesLoading] = useState(false);
  const [namespacesError, setNamespacesError] = useState<string | null>(null);
  const productionEnvironments = useMemo(
    () =>
      summary?.environments
        .filter((environment) => environment.kind === 'production')
        .map((environment) => ({
          ...environment,
          project: summary.projects.find((project) => project.id === environment.projectId),
        })) ?? [],
    [summary],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || kind !== 'durable_object' || namespaces.length > 0) return;
    let active = true;
    setNamespacesLoading(true);
    setNamespacesError(null);
    void getDurableObjectNamespaces()
      .then((items) => {
        if (active) setNamespaces(items);
      })
      .catch((reason: unknown) => {
        if (active) {
          setNamespacesError(
            reason instanceof Error
              ? reason.message
              : 'Durable Object namespaces could not be listed.',
          );
        }
      })
      .finally(() => {
        if (active) setNamespacesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, namespaces.length, open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedKind = formValue(form, 'kind') || 'd1';
    const environment = productionEnvironments.find(
      (candidate) => candidate.id === form.get('environmentId'),
    );
    const base = {
      projectId: environment?.projectId ?? '',
      environmentId: environment?.id ?? '',
      kind: selectedKind,
    };
    let payload: unknown;
    switch (selectedKind) {
      case 'd1':
      case 'kv':
      case 'r2':
      case 'queue':
        payload = { ...base, name: form.get('name') };
        break;
      case 'hyperdrive':
        payload = {
          ...base,
          name: form.get('name'),
          origin: {
            database: form.get('database'),
            host: form.get('host'),
            port: Number(form.get('port')),
            scheme: form.get('scheme'),
            user: form.get('user'),
            password: form.get('password'),
          },
        };
        break;
      case 'vectorize':
        payload = {
          ...base,
          name: form.get('name'),
          dimensions: Number(form.get('dimensions')),
          metric: form.get('metric'),
        };
        break;
      case 'ai_gateway':
        payload = {
          ...base,
          name: form.get('name'),
          cacheTtl: Number(form.get('cacheTtl')),
          collectLogs: form.get('collectLogs') === 'on',
        };
        break;
      case 'workflow':
        payload = {
          ...base,
          name: form.get('name'),
          className: form.get('className'),
          scriptName: form.get('scriptName'),
        };
        break;
      case 'durable_object': {
        const cloudflareId = formValue(form, 'cloudflareId');
        payload = {
          ...base,
          name: namespaces.find((namespace) => namespace.id === cloudflareId)?.name ?? '',
          cloudflareId,
        };
        break;
      }
      default:
        payload = { ...base, name: form.get('name') };
    }
    const parsed = createResourceInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Review the resource details.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const resource = await createResource(parsed.data);
      formElement.reset();
      setKind('d1');
      onCreated(resource);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The resource could not be provisioned.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="project-dialog" onCancel={onClose} onClose={onClose}>
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">Managed resource</span>
          <h2>Provision a Cloudflare service</h2>
          <p>WorkerDeck will create the resource, record ownership, and audit the operation.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <form className="project-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          <span>Project environment</span>
          <select name="environmentId" required defaultValue="">
            <option value="" disabled>
              Select a production environment
            </option>
            {productionEnvironments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.project?.name ?? 'Unknown project'} / {environment.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            <span>Resource type</span>
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              required
            >
              <option value="d1">D1 database</option>
              <option value="kv">KV namespace</option>
              <option value="r2">R2 bucket</option>
              <option value="hyperdrive">Hyperdrive connection</option>
              <option value="vectorize">Vectorize index</option>
              <option value="ai_gateway">Workers AI / AI Gateway</option>
              <option value="queue">Queue</option>
              <option value="workflow">Workflow</option>
              <option value="durable_object">Durable Object (adopt)</option>
            </select>
          </label>
          {kind === 'durable_object' ? (
            <label>
              <span>Existing namespace</span>
              <select name="cloudflareId" required disabled={namespacesLoading}>
                <option value="" disabled>
                  {namespacesLoading ? 'Listing namespaces...' : 'Select a namespace'}
                </option>
                {namespaces.map((namespace) => (
                  <option key={namespace.id} value={namespace.id}>
                    {namespace.name} ({namespace.scriptName})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <span>{kind === 'ai_gateway' ? 'Gateway id' : 'Resource name'}</span>
              <input name="name" placeholder="northstar-data" required />
            </label>
          )}
        </div>
        {kind === 'hyperdrive' ? (
          <div className="form-grid">
            <label>
              <span>Database</span>
              <input name="database" placeholder="app" required />
            </label>
            <label>
              <span>Host</span>
              <input name="host" placeholder="db.example.com" required />
            </label>
            <label>
              <span>Port</span>
              <input name="port" type="number" min={1} max={65535} defaultValue={5432} required />
            </label>
            <label>
              <span>Scheme</span>
              <select name="scheme" defaultValue="postgres">
                <option value="postgres">PostgreSQL</option>
                <option value="postgresql">PostgreSQL (explicit)</option>
                <option value="mysql">MySQL</option>
              </select>
            </label>
            <label>
              <span>User</span>
              <input name="user" placeholder="app_user" required />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" autoComplete="off" required />
            </label>
          </div>
        ) : null}
        {kind === 'vectorize' ? (
          <div className="form-grid">
            <label>
              <span>Dimensions</span>
              <input
                name="dimensions"
                type="number"
                min={1}
                max={1536}
                defaultValue={1536}
                required
              />
            </label>
            <label>
              <span>Metric</span>
              <select name="metric" defaultValue="cosine">
                <option value="cosine">Cosine</option>
                <option value="euclidean">Euclidean</option>
                <option value="dotproduct">Dot product</option>
              </select>
            </label>
          </div>
        ) : null}
        {kind === 'ai_gateway' ? (
          <div className="form-grid">
            <label>
              <span>Cache TTL (seconds)</span>
              <input name="cacheTtl" type="number" min={0} max={86400} defaultValue={0} required />
            </label>
            <label className="checkbox-row">
              <input name="collectLogs" type="checkbox" defaultChecked />
              <span>Collect request logs</span>
            </label>
          </div>
        ) : null}
        {kind === 'workflow' ? (
          <div className="form-grid">
            <label>
              <span>Class name</span>
              <input name="className" placeholder="OrderWorkflow" required />
            </label>
            <label>
              <span>Worker script</span>
              <input name="scriptName" placeholder="workerdeck-orders-api" required />
            </label>
          </div>
        ) : null}
        <div className="ownership-preview">
          <Box size={16} />
          {kind === 'durable_object'
            ? 'Adoption records ownership only; the Cloudflare namespace is never modified.'
            : 'Existing Cloudflare resources are never adopted or overwritten. Secrets are never stored in the ledger.'}
        </div>
        {namespacesError ? (
          <div className="form-error" role="alert">
            <AlertCircle size={16} />
            {namespacesError}
          </div>
        ) : null}
        {error ? (
          <div className="form-error" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : null}
        <div className="dialog-actions">
          <button className="button button--secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button--primary" type="submit" disabled={submitting}>
            {submitting ? 'Provisioning...' : 'Provision resource'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
