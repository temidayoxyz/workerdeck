import type { DashboardSummary } from '@workerdeck/contracts';
import { AlertCircle, GitCommitHorizontal, RotateCcw } from '../components/icon';
import { useState } from 'react';
import { DeploymentStatus } from '../components/status';
import { relativeTime, shortSha } from '../lib/format';

export function DeploymentsPage({
  summary,
  onRollback,
}: {
  summary: DashboardSummary | null;
  onRollback: (deploymentId: string) => Promise<void>;
}): React.JSX.Element {
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
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
              <span>
                <DeploymentStatus status={deployment.status} />
              </span>
              <span className="history-commit">
                <strong>{project?.name ?? 'Unknown project'}</strong>
                <small>
                  <GitCommitHorizontal size={13} />
                  <code>{shortSha(deployment.gitCommitSha)}</code>
                  {deployment.gitCommitMessage ?? 'Manual deployment'}
                </small>
              </span>
              <span>
                <code>{deployment.gitBranch ?? 'main'}</code>
              </span>
              <span className="muted-copy">{deployment.triggeredBy}</span>
              <span className="muted-copy">{relativeTime(deployment.createdAt)}</span>
              <span>
                {deployment.workerVersionId &&
                ['ready', 'rolled_back'].includes(deployment.status) &&
                environment?.kind === 'production' ? (
                  <button
                    className="rollback-button"
                    type="button"
                    disabled={rollingBack === deployment.id}
                    aria-label={`Roll back to ${deployment.gitCommitSha ?? deployment.workerVersionId}`}
                    onClick={() => {
                      if (
                        !window.confirm('Promote this Worker version to 100% production traffic?')
                      )
                        return;
                      setRollingBack(deployment.id);
                      setRollbackError(null);
                      void onRollback(deployment.id)
                        .catch((error: unknown) => {
                          setRollbackError(
                            error instanceof Error
                              ? error.message
                              : 'The rollback could not finish.',
                          );
                        })
                        .finally(() => setRollingBack(null));
                    }}
                  >
                    <RotateCcw size={13} />
                    {rollingBack === deployment.id ? 'Rolling back...' : 'Rollback'}
                  </button>
                ) : null}
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
