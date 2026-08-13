import type { Deployment, DeploymentStage } from '@workerdeck/contracts';

function stagesFor(deployment: Deployment): DeploymentStage[] {
  const failed = deployment.status === 'failed';
  const buildComplete = ['deploying', 'ready', 'rolled_back'].includes(deployment.status);
  const versionComplete = ['ready', 'rolled_back'].includes(deployment.status);

  return [
    { key: 'source', label: 'Source', status: 'complete', detail: deployment.gitBranch ?? 'main' },
    {
      key: 'build',
      label: 'Build',
      status: failed
        ? 'failed'
        : buildComplete
          ? 'complete'
          : deployment.status === 'building'
            ? 'running'
            : 'waiting',
      detail: deployment.buildId,
    },
    {
      key: 'version',
      label: 'Version',
      status: versionComplete
        ? 'complete'
        : deployment.status === 'deploying'
          ? 'running'
          : 'waiting',
      detail: deployment.workerVersionId,
    },
    {
      key: 'traffic',
      label: 'Traffic',
      status: deployment.status === 'ready' ? 'complete' : 'waiting',
      detail: deployment.status === 'ready' ? '100%' : null,
    },
  ];
}

export function DeploymentRail({ deployment }: { deployment: Deployment }): React.JSX.Element {
  return (
    <ol className="deployment-rail" aria-label="Deployment progress">
      {stagesFor(deployment).map((stage) => (
        <li className={`deployment-stage deployment-stage--${stage.status}`} key={stage.key}>
          <span className="deployment-node" aria-hidden="true" />
          <span className="deployment-stage-copy">
            <span>{stage.label}</span>
            <span>{stage.detail ?? 'Waiting'}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
