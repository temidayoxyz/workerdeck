import type { Deployment } from '@workerdeck/contracts';
import { titleCase } from '../lib/format';

type Tone = 'positive' | 'warning' | 'danger' | 'neutral' | 'running';

const toneByStatus: Record<Deployment['status'], Tone> = {
  queued: 'neutral',
  building: 'running',
  deploying: 'running',
  ready: 'positive',
  failed: 'danger',
  cancelled: 'neutral',
  rolled_back: 'warning',
};

export function DeploymentStatus({ status }: { status: Deployment['status'] }): React.JSX.Element {
  return (
    <span className={`status status--${toneByStatus[status]}`}>
      <span className="status-dot" aria-hidden="true" />
      {titleCase(status)}
    </span>
  );
}
