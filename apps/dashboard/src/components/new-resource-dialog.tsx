import {
  createResourceInputSchema,
  type DashboardSummary,
  type ManagedResource,
} from '@workerdeck/contracts';
import { AlertCircle, Box, X } from './icon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createResource } from '../lib/api';

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const environment = productionEnvironments.find(
      (candidate) => candidate.id === form.get('environmentId'),
    );
    const parsed = createResourceInputSchema.safeParse({
      projectId: environment?.projectId,
      environmentId: environment?.id,
      kind: form.get('kind'),
      name: form.get('name'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Review the resource details.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const resource = await createResource(parsed.data);
      formElement.reset();
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
            <select name="kind" defaultValue="d1" required>
              <option value="d1">D1 database</option>
              <option value="kv">KV namespace</option>
              <option value="r2">R2 bucket</option>
            </select>
          </label>
          <label>
            <span>Resource name</span>
            <input name="name" placeholder="northstar-data" required />
          </label>
        </div>
        <div className="ownership-preview">
          <Box size={16} />
          Existing Cloudflare resources are never adopted or overwritten.
        </div>
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
