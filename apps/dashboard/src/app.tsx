import type { DashboardSummary, ManagedResource, Project } from '@workerdeck/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import {
  createDeployment,
  deleteDeployment,
  deleteProject,
  getDashboard,
  isDemoMode,
  rollbackDeployment,
  syncDeployment,
} from './lib/api';
import { DeploymentsPage } from './pages/deployments';
import { NewProjectPage } from './pages/new-project';
import { NotFoundPage } from './pages/not-found';
import { BackupsPage, DomainsPage, ObservabilityPage, UsagePage } from './pages/operations';
import { OverviewPage } from './pages/overview';
import {
  ProjectDeploymentsPage,
  ProjectDomainsPage,
  ProjectLogsPage,
  ProjectPage,
  ProjectResourcesPage,
  ProjectSettingsPage,
  ProjectVariablesPage,
} from './pages/project';
import { ProjectsPage } from './pages/projects';
import { ResourcesPage } from './pages/resources';
import { SettingsPage } from './pages/settings';

export function App(): React.JSX.Element {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getDashboard());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'WorkerDeck could not load the dashboard.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isDemoMode()) return;
    const timer = window.setInterval(() => {
      void getDashboard()
        .then(setSummary)
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeDeploymentIds =
    summary?.deployments
      .filter((deployment) => ['queued', 'building', 'deploying'].includes(deployment.status))
      .map((deployment) => deployment.id)
      .join(',') ?? '';

  useEffect(() => {
    if (!activeDeploymentIds || new URLSearchParams(window.location.search).get('demo') === '1') {
      return;
    }
    const timer = window.setInterval(() => {
      void Promise.allSettled(activeDeploymentIds.split(',').map(syncDeployment)).then(
        (results) => {
          const updates = new Map(
            results
              .filter((result) => result.status === 'fulfilled')
              .map((result) => [result.value.id, result.value]),
          );
          if (updates.size === 0) return;
          setSummary((current) =>
            current
              ? {
                  ...current,
                  deployments: current.deployments.map(
                    (deployment) => updates.get(deployment.id) ?? deployment,
                  ),
                }
              : current,
          );
        },
      );
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeDeploymentIds]);

  const handleProjectCreated = async (project: Project) => {
    setSummary((current) =>
      current ? { ...current, projects: [project, ...current.projects] } : current,
    );
    if (!isDemoMode()) await load();
  };

  const handleProjectDeleted = async (projectId: string, confirmation: string) => {
    await deleteProject(projectId, confirmation);
    await load();
  };

  const handleDeploymentDeleted = async (deploymentId: string) => {
    await deleteDeployment(deploymentId);
    setSummary((current) =>
      current
        ? {
            ...current,
            deployments: current.deployments.filter((deployment) => deployment.id !== deploymentId),
          }
        : current,
    );
  };

  const handleDeploy = async (projectId: string, environmentId: string) => {
    const deployment = await createDeployment(projectId, environmentId);
    setSummary((current) =>
      current
        ? {
            ...current,
            deployments: [
              deployment,
              ...current.deployments.filter((candidate) => candidate.id !== deployment.id),
            ],
          }
        : current,
    );
  };

  const handleResourceCreated = (resource: ManagedResource) => {
    setSummary((current) =>
      current
        ? {
            ...current,
            resourceCounts: {
              ...current.resourceCounts,
              [resource.kind]: current.resourceCounts[resource.kind] + 1,
            },
          }
        : current,
    );
  };

  const handleRollback = async (deploymentId: string) => {
    const deployment = await rollbackDeployment(deploymentId);
    setSummary((current) =>
      current ? { ...current, deployments: [deployment, ...current.deployments] } : current,
    );
  };

  return (
    <Routes>
      <Route
        element={
          <AppShell
            summary={summary}
            onProjectCreated={handleProjectCreated}
            onProjectDeleted={handleProjectDeleted}
            onDeploymentDeleted={handleDeploymentDeleted}
          />
        }
      >
        <Route
          index
          element={
            <OverviewPage
              summary={summary}
              loading={loading}
              error={error}
              onRetry={() => void load()}
            />
          }
        />
        <Route
          path="projects"
          element={<ProjectsPage summary={summary} onDeploy={handleDeploy} />}
        />
        <Route path="projects/new" element={<NewProjectPage />} />
        <Route
          path="projects/:projectId"
          element={<ProjectPage summary={summary} onDeploy={handleDeploy} />}
        />
        <Route
          path="projects/:projectId/deployments"
          element={<ProjectDeploymentsPage summary={summary} onDeploy={handleDeploy} />}
        />
        <Route
          path="projects/:projectId/variables"
          element={<ProjectVariablesPage summary={summary} onDeploy={handleDeploy} />}
        />
        <Route
          path="projects/:projectId/logs"
          element={<ProjectLogsPage summary={summary} onDeploy={handleDeploy} />}
        />
        <Route
          path="projects/:projectId/resources"
          element={<ProjectResourcesPage summary={summary} onDeploy={handleDeploy} />}
        />
        <Route
          path="projects/:projectId/domains"
          element={<ProjectDomainsPage summary={summary} onDeploy={handleDeploy} />}
        />
        <Route
          path="projects/:projectId/settings"
          element={<ProjectSettingsPage summary={summary} onDeploy={handleDeploy} />}
        />
        <Route
          path="projects/:projectId/settings/deployments"
          element={<ProjectDeploymentsRedirect />}
        />
        <Route
          path="deployments"
          element={<DeploymentsPage summary={summary} onRollback={handleRollback} />}
        />
        <Route
          path="resources"
          element={<ResourcesPage summary={summary} onResourceCreated={handleResourceCreated} />}
        />
        <Route path="domains" element={<DomainsPage summary={summary} />} />
        <Route path="observability" element={<ObservabilityPage summary={summary} />} />
        <Route path="backups" element={<BackupsPage summary={summary} />} />
        <Route path="usage" element={<UsagePage summary={summary} />} />
        <Route path="settings" element={<SettingsPage summary={summary} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function ProjectDeploymentsRedirect(): React.JSX.Element {
  const { projectId } = useParams();
  const location = useLocation();
  return <Navigate to={`/projects/${projectId ?? ''}/deployments${location.search}`} replace />;
}
