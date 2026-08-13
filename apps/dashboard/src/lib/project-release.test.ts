import { describe, expect, it } from 'vitest';
import { demoSummary } from './fixtures';
import { projectReleaseState } from './project-release';

describe('projectReleaseState', () => {
  it('uses the latest production deployment instead of the project lifecycle flag', () => {
    const project = demoSummary.projects[0]!;
    expect(
      projectReleaseState(project.id, demoSummary.environments, demoSummary.deployments),
    ).toMatchObject({ label: 'Live', tone: 'live' });
  });

  it('does not call an undeployed project healthy', () => {
    expect(projectReleaseState('missing-project', [], [])).toEqual({
      label: 'Not deployed',
      tone: 'inactive',
      deployment: undefined,
    });
  });

  it('preserves live-service context when a newer deployment fails', () => {
    const project = demoSummary.projects[0]!;
    const ready = demoSummary.deployments.find((item) => item.projectId === project.id)!;
    expect(
      projectReleaseState(project.id, demoSummary.environments, [
        {
          ...ready,
          id: crypto.randomUUID(),
          status: 'failed',
          createdAt: new Date().toISOString(),
        },
        ready,
      ]),
    ).toMatchObject({ label: 'Live · deploy failed', tone: 'failed' });
  });
});
