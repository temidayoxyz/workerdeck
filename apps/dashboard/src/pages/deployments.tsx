import type { DashboardSummary } from '@workerdeck/contracts';
import {
  AlertCircle,
  Code2,
  ExternalLink,
  GitCommitHorizontal,
  RotateCcw,
  Trash2,
} from '../components/icon';
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { ShellContext } from '../components/app-shell';
import { ConfirmDialog } from '../components/confirm-dialog';
import { DeploymentStatus } from '../components/status';
import { relativeTime, shortSha } from '../lib/format';

interface PendingAction {
  kind: 'rollback' | 'delete';
  deploymentId: string;
}

export function DeploymentsPage({
  summary,
  onRollback,
}: {
  summary: DashboardSummary | null;
  onRollback: (deploymentId: string) => Promise<void>;
}): React.JSX.Element {
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const { deploymentDeleted } = useOutletContext<ShellContext>();
  const pendingDeployment = summary?.deployments.find(
    (deployment) => deployment.id === pending?.deploymentId,
  );
  const pendingProject = pendingDeployment
    ? summary?.projects.find((candidate) => candidate.id === pendingDeployment.projectId)
    : undefined;

  const runPending = (): void => {
    if (!pending) return;
    if (pending.kind === 'rollback') {
      setRollingBack(pending.deploymentId);
      setRollbackError(null);
      void onRollback(pending.deploymentId)
        .catch((error: unknown) => {
          setRollbackError(
            error instanceof Error ? error.message : 'The rollback could not finish.',
          );
        })
        .finally(() => setRollingBack(null));
    } else {
      setDeleting(pending.deploymentId);
      setRollbackError(null);
      void deploymentDeleted(pending.deploymentId)
        .catch((error: unknown) =>
          setRollbackError(
            error instanceof Error ? error.message : 'The deployment could not be deleted.',
          ),
        )
        .finally(() => setDeleting(null));
    }
    setPending(null);
  };

  return (
    <div className="standard-page">
      <section className="page-intro page-intro--compact">
        <div>
          <span className="eyebrow">Release history</span>
          <h1>Deployments</h1>
          <p>Every build, version, promotion, and rollback across your projects.</p>
        </div>
      </section>
      <section className="panel deployment-history">
        {rollbackError ? (
          <div className="catalog-alert" role="alert">
            <AlertCircle size={16} />
            <span>{rollbackError}</span>
            <button type="button" onClick={() => setRollbackError(null)}>
              Dismiss
            </button>
          </div>
        ) : null}
        <div className="history-row history-row--header">
          <span>Status</span>
          <span>Project and commit</span>
          <span>Branch</span>
          <span>Triggered by</span>
          <span>Created</span>
          <span />
        </div>
        {summary?.deployments.map((deployment) => {
          const project = summary.projects.find(
            (candidate) => candidate.id === deployment.projectId,
          );
          const environment = summary.environments.find(
            (candidate) => candidate.id === deployment.environmentId,
          );
          return (
            <div className="history-row" key={deployment.id}>
              <span className="status-cell">
                <DeploymentStatus status={deployment.status} />
                {summary.environments.find((candidate) => candidate.id === deployment.environmentId)
                  ?.kind === 'preview' ? (
                  <span className="environment-badge">Preview</span>
                ) : null}
              </span>
              <span className="history-commit">
                <strong>{project?.name ?? 'Unknown project'}</strong>
                <small>
                  <GitCommitHorizontal size={13} />
                  <code>{shortSha(deployment.gitCommitSha)}</code>
                  <span className="history-commit-message">
                    {deployment.gitCommitMessage ?? 'Manual deployment'}
                  </span>
                </small>
                {deployment.previewUrl ? (
                  <a
                    className="preview-url-link"
                    href={deployment.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={deployment.previewUrl}
                  >
                    <ExternalLink size={12} />
                    <span>{new URL(deployment.previewUrl).hostname}</span>
                  </a>
                ) : null}
              </span>
              <span>
                <code>{deployment.gitBranch ?? 'main'}</code>
              </span>
              <span className="muted-copy">{deployment.triggeredBy}</span>
              <span className="muted-copy">{relativeTime(deployment.createdAt)}</span>
              <span>
                <span className="deployment-actions">
                  {deployment.workerVersionId &&
                  ['ready', 'rolled_back'].includes(deployment.status) &&
                  environment?.kind === 'production' ? (
                    <button
                      className="rollback-button"
                      type="button"
                      disabled={rollingBack === deployment.id}
                      aria-label={`Roll back to ${deployment.gitCommitSha ?? deployment.workerVersionId}`}
                      onClick={() => setPending({ kind: 'rollback', deploymentId: deployment.id })}
                    >
                      <RotateCcw size={13} />
                      {rollingBack === deployment.id ? 'Rolling back...' : 'Rollback'}
                    </button>
                  ) : null}
                  {project ? (
                    <Link
                      className="row-action"
                      to={`/projects/${project.id}/logs/${deployment.id}`}
                      aria-label={`View build logs for ${project.name}`}
                    >
                      <Code2 size={15} />
                    </Link>
                  ) : null}
                  <button
                    className="row-action danger-action"
                    type="button"
                    aria-label={`Delete ${project?.name ?? 'project'} deployment`}
                    disabled={
                      deleting === deployment.id ||
                      ['queued', 'building', 'deploying'].includes(deployment.status)
                    }
                    onClick={() => setPending({ kind: 'delete', deploymentId: deployment.id })}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </span>
            </div>
          );
        })}
      </section>
      <ConfirmDialog
        open={pending !== null}
        danger={pending?.kind === 'delete'}
        busy={rollingBack !== null || deleting !== null}
        title={pending?.kind === 'rollback' ? 'Promote to production?' : 'Delete this deployment?'}
        body={
          pending?.kind === 'rollback'
            ? `Version ${shortSha(pendingDeployment?.gitCommitSha ?? null)} of ${pendingProject?.name ?? 'this project'} will receive 100% of production traffic.`
            : 'WorkerDeck will also remove its historical Cloudflare Worker deployment when one exists.'
        }
        confirmLabel={pending?.kind === 'rollback' ? 'Promote version' : 'Delete deployment'}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
