import {
  createProjectInputSchema,
  type GitRepository,
  type RepositoryInspection,
} from '@workerdeck/contracts';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Cloud,
  Github,
  Gitlab,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { ShellContext } from '../components/app-shell';
import { BrandMark } from '../components/brand';
import {
  createProject,
  getGitHubConnection,
  getGitHubRepositories,
  inspectGitHubRepository,
  registerGitHubInstallation,
  startGitHubSetup,
  syncGitHubInstallations,
} from '../lib/api';

type Provider = 'github' | 'gitlab' | 'public';

const humanizeRepositoryName = (name: string): string =>
  name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) =>
      ['api', 'cli', 'sdk', 'ui'].includes(part.toLowerCase())
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(' ');

const projectSlugFrom = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return slug.length >= 3 ? slug : `${slug || 'worker'}-app`;
};

export function NewProjectPage(): React.JSX.Element {
  const { projectCreated } = useOutletContext<ShellContext>();
  const [provider, setProvider] = useState<Provider>('github');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [repositoriesLoading, setRepositoriesLoading] = useState(true);
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [repositorySearch, setRepositorySearch] = useState('');
  const [connection, setConnection] = useState<
    Awaited<ReturnType<typeof getGitHubConnection>> | undefined
  >();
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [selectedRepository, setSelectedRepository] = useState<GitRepository | null>(null);
  const [inspection, setInspection] = useState<RepositoryInspection | null>(null);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [productionBranch, setProductionBranch] = useState('main');
  const [rootDirectory, setRootDirectory] = useState('/');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [deployCommand, setDeployCommand] = useState('npx wrangler deploy --yes');
  const inspectionRequest = useRef(0);
  const navigate = useNavigate();

  const loadRepositories = async () => {
    setRepositoriesLoading(true);
    setError(null);
    try {
      const nextConnection = await getGitHubConnection();
      setConnection(nextConnection);
      setRepositories(nextConnection.installations.length > 0 ? await getGitHubRepositories() : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The GitHub connection could not load.');
    } finally {
      setRepositoriesLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const parameters = new URLSearchParams(window.location.search);
    const installationId = parameters.get('installation_id');
    const state = parameters.get('state');
    const load = async () => {
      setRepositoriesLoading(true);
      try {
        if (installationId && state) {
          await registerGitHubInstallation(installationId, state);
          window.history.replaceState({}, '', '/projects/new');
        }
        const nextConnection = await getGitHubConnection();
        if (!active) return;
        setConnection(nextConnection);
        const nextRepositories =
          nextConnection.installations.length > 0 ? await getGitHubRepositories() : [];
        setRepositories(nextRepositories);
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : 'The GitHub connection could not load.',
          );
        }
      } finally {
        if (active) setRepositoriesLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const visibleRepositories = useMemo(() => {
    const query = repositorySearch.trim().toLowerCase();
    return repositories
      .filter((repository) => !query || repository.fullName.toLowerCase().includes(query))
      .sort((left, right) => (right.pushedAt ?? '').localeCompare(left.pushedAt ?? ''));
  }, [repositories, repositorySearch]);

  const connectGitHub = () => {
    setRepositoriesLoading(true);
    setError(null);
    void syncGitHubInstallations()
      .then(async (installations) => {
        if (installations.length > 0) {
          await loadRepositories();
          return;
        }
        window.location.assign(await startGitHubSetup());
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'GitHub setup could not start.'),
      )
      .finally(() => setRepositoriesLoading(false));
  };

  const selectRepository = async (repository: GitRepository) => {
    const requestId = inspectionRequest.current + 1;
    inspectionRequest.current = requestId;
    setSelectedRepository(repository);
    setRepositoryUrl(repository.url);
    setProjectName(humanizeRepositoryName(repository.name));
    setProjectSlug(projectSlugFrom(repository.name));
    setProductionBranch(repository.defaultBranch);
    setInspection(null);
    setInspectionLoading(true);
    setError(null);
    try {
      const detected = await inspectGitHubRepository(repository.id);
      if (inspectionRequest.current !== requestId) return;
      setInspection(detected);
      setRootDirectory(detected.rootDirectory);
      setBuildCommand(detected.buildCommand);
      setDeployCommand(detected.deployCommand);
    } catch (reason) {
      if (inspectionRequest.current === requestId) {
        setError(reason instanceof Error ? reason.message : 'Repository inspection failed.');
      }
    } finally {
      if (inspectionRequest.current === requestId) setInspectionLoading(false);
    }
  };

  const updatePublicRepositoryUrl = (url: string) => {
    setRepositoryUrl(url);
    setSelectedRepository(null);
    setInspection(null);
    try {
      const repositoryName = new URL(url).pathname
        .split('/')
        .filter(Boolean)
        .at(-1)
        ?.replace(/\.git$/, '');
      if (repositoryName) {
        setProjectName(humanizeRepositoryName(repositoryName));
        setProjectSlug(projectSlugFrom(repositoryName));
      }
    } catch {
      // Keep the partially entered URL without guessing project metadata.
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = createProjectInputSchema.safeParse({
      name: data.get('name'),
      slug: data.get('slug'),
      repositoryUrl,
      productionBranch: data.get('productionBranch'),
      framework: inspection?.framework ?? 'unknown',
      rootDirectory: data.get('rootDirectory'),
      buildCommand: data.get('buildCommand'),
      deployCommand: data.get('deployCommand'),
      ...(provider === 'github' && selectedRepository
        ? {
            repositoryProvider: 'github',
            repositoryProviderAccountId: selectedRepository.ownerId,
            repositoryProviderAccountName: selectedRepository.owner,
            repositoryId: selectedRepository.id,
          }
        : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Review the repository configuration.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const project = await createProject(parsed.data);
      projectCreated(project);
      void navigate(`/projects/${project.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'WorkerDeck could not import this repository.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const githubReady =
    provider !== 'github' || Boolean(selectedRepository && inspection?.ready && !inspectionLoading);

  return (
    <div className="new-project-page">
      <section className="wizard-intro">
        <div>
          <span className="eyebrow">Create project</span>
          <h1>Deploy a new project</h1>
          <p>
            Select a repository. WorkerDeck will inspect, configure, and deploy it to Cloudflare.
          </p>
        </div>
        <div className="edge-destination" aria-label="Deployment steps">
          <span>Source</span>
          <i />
          <span>Configure</span>
          <i />
          <span>Deploy</span>
          <Globe2 size={20} />
        </div>
      </section>
      <div className="wizard-layout">
        <form className="wizard-form" onSubmit={(event) => void submit(event)}>
          <section className="panel wizard-section">
            <div className="section-heading">
              <div>
                <span className="step-number">1</span>
                <h2>Choose a repository</h2>
              </div>
              <span className="security-note">
                <ShieldCheck size={15} /> Scoped access
              </span>
            </div>
            <div className="provider-grid">
              <button
                className={
                  provider === 'github' ? 'provider-card provider-card--active' : 'provider-card'
                }
                type="button"
                onClick={() => setProvider('github')}
              >
                <Github size={23} />
                <span>
                  <strong>GitHub</strong>
                  <small>GitHub App installation</small>
                </span>
                {provider === 'github' ? <Check size={16} /> : null}
              </button>
              <button
                className={
                  provider === 'gitlab' ? 'provider-card provider-card--active' : 'provider-card'
                }
                type="button"
                onClick={() => setProvider('gitlab')}
              >
                <Gitlab size={23} />
                <span>
                  <strong>GitLab</strong>
                  <small>Cloudflare Git integration</small>
                </span>
                {provider === 'gitlab' ? <Check size={16} /> : null}
              </button>
              <button
                className={
                  provider === 'public' ? 'provider-card provider-card--active' : 'provider-card'
                }
                type="button"
                onClick={() => setProvider('public')}
              >
                <Globe2 size={23} />
                <span>
                  <strong>Public URL</strong>
                  <small>Manual fallback</small>
                </span>
                {provider === 'public' ? <Check size={16} /> : null}
              </button>
            </div>

            {provider === 'github' ? (
              <div className="github-source">
                <div className="provider-connection">
                  <span className="provider-status-icon">
                    <Github size={18} />
                  </span>
                  <span>
                    <strong>
                      {connection?.installations.length
                        ? `${connection.installations[0]?.accountLogin} connected`
                        : 'Connect GitHub'}
                    </strong>
                    <small>
                      {connection?.installations.length
                        ? 'Repositories are read from your GitHub App installation.'
                        : 'Install the GitHub App once, then choose repositories here.'}
                    </small>
                  </span>
                  {connection?.configured ? (
                    <button className="text-button" type="button" onClick={connectGitHub}>
                      {connection.installations.length ? 'Manage access' : 'Connect GitHub'}
                    </button>
                  ) : (
                    <span className="muted-copy">Configure in settings</span>
                  )}
                </div>

                {connection?.installations.length ? (
                  <div className="repository-browser">
                    <div className="repository-browser-toolbar">
                      <label className="field-control repository-search">
                        <Search size={16} />
                        <input
                          value={repositorySearch}
                          onChange={(event) => setRepositorySearch(event.target.value)}
                          placeholder="Search repositories…"
                          aria-label="Search repositories"
                        />
                      </label>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => void loadRepositories()}
                        aria-label="Refresh repositories"
                        disabled={repositoriesLoading}
                      >
                        <RefreshCw size={16} className={repositoriesLoading ? 'spin' : undefined} />
                      </button>
                    </div>
                    <div className="repository-picker-heading">
                      <span>Your repositories</span>
                      <small>
                        {visibleRepositories.length} of {repositories.length}
                      </small>
                    </div>
                    <div className="repository-list" aria-busy={repositoriesLoading}>
                      {repositoriesLoading ? (
                        <div className="repository-empty">
                          <LoaderCircle className="spin" size={19} />
                          <strong>Loading repositories</strong>
                          <small>Reading the authorized GitHub installation…</small>
                        </div>
                      ) : visibleRepositories.length ? (
                        visibleRepositories.map((repository) => (
                          <button
                            key={repository.id}
                            className={
                              selectedRepository?.id === repository.id
                                ? 'repository-option repository-option--active'
                                : 'repository-option'
                            }
                            type="button"
                            onClick={() => void selectRepository(repository)}
                            aria-pressed={selectedRepository?.id === repository.id}
                          >
                            <span className="repository-icon">
                              <Github size={17} />
                            </span>
                            <span>
                              <strong>{repository.fullName}</strong>
                              <small>
                                {repository.language ?? 'Repository'} · {repository.defaultBranch}
                                {repository.pushedAt
                                  ? ` · updated ${new Date(repository.pushedAt).toLocaleDateString()}`
                                  : ''}
                              </small>
                            </span>
                            <span className="repository-visibility">
                              {repository.private ? (
                                <LockKeyhole size={14} />
                              ) : (
                                <Globe2 size={14} />
                              )}
                              {repository.private ? 'Private' : 'Public'}
                            </span>
                            {selectedRepository?.id === repository.id ? (
                              <Check size={16} />
                            ) : (
                              <ArrowRight size={15} />
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="repository-empty">
                          <Search size={19} />
                          <strong>No repositories found</strong>
                          <small>
                            {repositorySearch
                              ? 'Try another search.'
                              : 'Update the GitHub App repository access, then refresh.'}
                          </small>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <label className="field-label">
                <span>Repository URL</span>
                <span className="field-control">
                  <Search size={16} />
                  <input
                    name="repositoryUrl"
                    type="url"
                    placeholder="https://github.com/owner/repository"
                    value={repositoryUrl}
                    onChange={(event) => updatePublicRepositoryUrl(event.target.value)}
                    required
                  />
                </span>
                <small>
                  {provider === 'gitlab'
                    ? 'Authorize the repository through the Cloudflare GitLab integration first.'
                    : 'Use this fallback only for a public repository.'}
                </small>
              </label>
            )}
          </section>

          <section className="panel wizard-section">
            <div className="section-heading">
              <div>
                <span className="step-number">2</span>
                <h2>Review detected configuration</h2>
              </div>
              {inspection ? (
                <span
                  className={`detection-badge detection-badge--${inspection.ready ? 'ready' : 'warning'}`}
                >
                  <Sparkles size={14} /> {inspection.displayName}
                </span>
              ) : null}
            </div>

            {inspectionLoading ? (
              <div className="inspection-state">
                <LoaderCircle className="spin" size={19} />
                <span>
                  <strong>Inspecting {selectedRepository?.name}</strong>
                  <small>
                    Reading framework signatures, package scripts, lockfiles, and workspace roots.
                  </small>
                </span>
              </div>
            ) : inspection ? (
              <div
                className={
                  inspection.ready
                    ? 'inspection-state inspection-state--ready'
                    : 'inspection-state inspection-state--warning'
                }
              >
                {inspection.ready ? <Check size={19} /> : <AlertCircle size={19} />}
                <span>
                  <strong>
                    {inspection.ready
                      ? `${inspection.displayName} detected`
                      : 'Manual configuration required'}
                  </strong>
                  <small>{inspection.evidence.join(' ')}</small>
                </span>
                <dl>
                  <div>
                    <dt>Runtime</dt>
                    <dd>{inspection.runtime}</dd>
                  </div>
                  <div>
                    <dt>Package manager</dt>
                    <dd>{inspection.packageManager}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{inspection.confidence}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="inspection-state inspection-state--idle">
                <Search size={19} />
                <span>
                  <strong>Select a repository to begin</strong>
                  <small>
                    WorkerDeck fills these fields from the repository, and you can edit them before
                    deploying.
                  </small>
                </span>
              </div>
            )}

            <div className="form-grid">
              <label className="field-label">
                <span>Project name</span>
                <span className="field-control">
                  <input
                    name="name"
                    placeholder="Checkout API"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </span>
              </label>
              <label className="field-label">
                <span>Project slug</span>
                <span className="field-control">
                  <input
                    name="slug"
                    placeholder="checkout-api"
                    value={projectSlug}
                    onChange={(event) => setProjectSlug(projectSlugFrom(event.target.value))}
                    pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                    required
                  />
                </span>
              </label>
            </div>
            <label className="field-label">
              <span>Production branch</span>
              <span className="field-control">
                <input
                  name="productionBranch"
                  value={productionBranch}
                  onChange={(event) => setProductionBranch(event.target.value)}
                  required
                />
              </span>
            </label>
            <div className="form-grid form-grid--three">
              <label className="field-label">
                <span>Root directory</span>
                <span className="field-control">
                  <input
                    name="rootDirectory"
                    value={rootDirectory}
                    onChange={(event) => setRootDirectory(event.target.value)}
                    required
                  />
                </span>
              </label>
              <label className="field-label">
                <span>Build command</span>
                <span className="field-control">
                  <input
                    name="buildCommand"
                    value={buildCommand}
                    onChange={(event) => setBuildCommand(event.target.value)}
                    required
                  />
                </span>
              </label>
              <label className="field-label">
                <span>Deploy command</span>
                <span className="field-control">
                  <input
                    name="deployCommand"
                    value={deployCommand}
                    onChange={(event) => setDeployCommand(event.target.value)}
                    required
                  />
                </span>
              </label>
            </div>
            {inspection?.warnings.map((warning) => (
              <div className="detection-warning" key={warning}>
                <AlertCircle size={15} />
                <span>{warning}</span>
              </div>
            ))}
            <div className="compatibility-row">
              <Check size={16} />
              <span>
                <strong>Repository-driven deployments</strong>
                <small>
                  The production branch auto-deploys on commit. Other branches create preview
                  versions; previous deployments remain available for rollback.
                </small>
              </span>
            </div>
            {error ? (
              <div className="inline-alert">
                <AlertCircle size={16} />
                {error}
              </div>
            ) : null}
          </section>
          <div className="wizard-actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void navigate('/projects')}
            >
              Cancel
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={submitting || !githubReady}
            >
              {submitting ? (
                <>
                  <LoaderCircle className="spin" size={16} /> Creating deployment…
                </>
              ) : (
                <>
                  Deploy project <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>

        <aside className="panel deployment-plan">
          <span className="eyebrow">Deployment plan</span>
          <h2>{inspection ? `${inspection.displayName} on Cloudflare` : 'Cloudflare Worker'}</h2>
          <dl className="definition-list">
            <div>
              <dt>Repository</dt>
              <dd>
                {selectedRepository?.fullName ??
                  (provider === 'github' ? 'Not selected' : 'Public URL')}
              </dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>Production</dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>{inspection?.runtime ?? 'Detecting'}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>
                <LockKeyhole size={14} /> Least privilege
              </dd>
            </div>
          </dl>
          <div className="plan-divider" />
          <h3>Build and deploy flow</h3>
          <ol className="plan-flow">
            <li className={selectedRepository ? 'plan-flow--active' : undefined}>
              <span>
                <Github size={17} />
              </span>
              <div>
                <strong>GitHub</strong>
                <small>
                  {selectedRepository ? selectedRepository.defaultBranch : 'Choose a repository'}
                </small>
              </div>
            </li>
            <li className={inspection ? 'plan-flow--active' : undefined}>
              <span>
                <Cloud size={17} />
              </span>
              <div>
                <strong>Workers Builds</strong>
                <small>{inspection?.buildCommand ?? 'Framework-aware build'}</small>
              </div>
            </li>
            <li>
              <span>
                <BrandMark className="mini-brand-mark" />
              </span>
              <div>
                <strong>Versioned Worker</strong>
                <small>Production and preview triggers</small>
              </div>
            </li>
            <li>
              <span>
                <Globe2 size={17} />
              </span>
              <div>
                <strong>Global</strong>
                <small>First deployment starts now</small>
              </div>
            </li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
