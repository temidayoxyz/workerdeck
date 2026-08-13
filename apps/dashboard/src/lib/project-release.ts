import type { Deployment, Environment } from '@workerdeck/contracts';

export type ReleaseState = {
  label: string;
  tone: 'live' | 'failed' | 'progress' | 'inactive';
  deployment: Deployment | undefined;
};

export function projectReleaseState(
  projectId: string,
  environments: Environment[],
  deployments: Deployment[],
): ReleaseState {
  const productionId = environments.find(
    (environment) => environment.projectId === projectId && environment.kind === 'production',
  )?.id;
  const deployment = deployments.find(
    (candidate) =>
      candidate.projectId === projectId &&
      (!productionId || candidate.environmentId === productionId),
  );
  const hasLiveRelease = deployments.some(
    (candidate) =>
      candidate.projectId === projectId &&
      candidate.status === 'ready' &&
      (!productionId || candidate.environmentId === productionId),
  );

  if (!deployment) return { label: 'Not deployed', tone: 'inactive', deployment };
  if (deployment.status === 'ready') return { label: 'Live', tone: 'live', deployment };
  if (['queued', 'building', 'deploying'].includes(deployment.status)) {
    return { label: 'Deploying', tone: 'progress', deployment };
  }
  if (deployment.status === 'rolled_back') {
    return { label: 'Rolled back', tone: 'inactive', deployment };
  }
  if (deployment.status === 'cancelled') {
    return {
      label: hasLiveRelease ? 'Live · deploy cancelled' : 'Cancelled',
      tone: hasLiveRelease ? 'failed' : 'inactive',
      deployment,
    };
  }
  return {
    label: hasLiveRelease ? 'Live · deploy failed' : 'Deploy failed',
    tone: 'failed',
    deployment,
  };
}
