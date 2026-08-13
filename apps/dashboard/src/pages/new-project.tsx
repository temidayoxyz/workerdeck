import { createProjectInputSchema, type GitRepository } from '@workerdeck/contracts';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Cloud,
  Github,
  Gitlab,
  Globe2,
  LockKeyhole,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { ShellContext } from '../components/app-shell';
import { BrandMark } from '../components/brand';
import {
  createProject,
  getGitHubConnection,
  getGitHubRepositories,
  registerGitHubInstallation,
  startGitHubSetup,
} from '../lib/api';

type Provider = 'github' | 'gitlab' | 'public';

export function NewProjectPage(): React.JSX.Element {
  const { projectCreated } = useOutletContext<ShellContext>();
  const [provider, setProvider] = useState<Provider>('github');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [repositories, setRepositories] = useState<GitRepository[]>([]);
  const [connection, setConnection] = useState<
    Awaited<ReturnType<typeof getGitHubConnection>> | undefined
  >();
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [selectedRepository, setSelectedRepository] = useState<GitRepository | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [productionBranch, setProductionBranch] = useState('main');
  const [rootDirectory, setRootDirectory] = useState('/');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [deployCommand, setDeployCommand] = useState('npx wrangler deploy');
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const installationId = new URLSearchParams(window.location.search).get('installation_id');
    const state = new URLSearchParams(window.location.search).get('state');
    const load = async () => {
      try {
        if (installationId && state) {
          await registerGitHubInstallation(installationId, state);
          window.history.replaceState({}, '', '/projects/new');
        }
        const nextConnection = await getGitHubConnection();
        if (!active) return;
        setConnection(nextConnection);
        if (nextConnection.installations.length > 0) {
          setRepositories(await getGitHubRepositories());
        }
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : 'The GitHub connection could not load.',
          );
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const selectRepository = (repository: GitRepository) => {
    setSelectedRepository(repository);
    setRepositoryUrl(repository.url);
    setProjectName(
      repository.name
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
    );
    setProjectSlug(repository.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
    setProductionBranch(repository.defaultBranch);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = createProjectInputSchema.safeParse({
      name: data.get('name'),
      slug: data.get('slug'),
      repositoryUrl: data.get('repositoryUrl'),
      productionBranch: data.get('productionBranch'),
      framework: 'unknown',
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

  return (
    <div className="new-project-page">
      <section className="wizard-intro">
        <div>
          <span className="eyebrow">Create project</span>
          <h1>Deploy a new project</h1>
          <p>Choose a source, review the detected runtime, and hand the build to Cloudflare.</p>
        </div>
        <div className="edge-destination">
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
                <h2>Source repository</h2>
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
                  <small>Cloudflare GitHub App</small>
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
                  <strong>Public repository</strong>
                  <small>No provider authorization</small>
                </span>
                {provider === 'public' ? <Check size={16} /> : null}
              </button>
            </div>
            {provider === 'github' ? (
              <div className="provider-connection">
                <span className="provider-status-icon">
                  <Github size={18} />
                </span>
                <span>
                  <strong>
                    {connection?.installations.length
                      ? `${connection.installations[0]?.accountLogin} connected`
                      : 'Connect GitHub repository picker'}
                  </strong>
                  <small>
                    WorkerDeck reads repository metadata through your scoped GitHub App. Cloudflare
                    still owns the build connection and source checkout.
                  </small>
                </span>
                {connection?.configured ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      void startGitHubSetup()
                        .then((url) => window.location.assign(url))
                        .catch((reason: unknown) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : 'GitHub setup could not start.',
                          ),
                        );
                    }}
                  >
                    Manage access
                  </button>
                ) : (
                  <span className="muted-copy">Configure in settings</span>
                )}
              </div>
            ) : null}
            {provider === 'gitlab' ? (
              <div className="provider-connection">
                <span className="provider-status-icon">
                  <Gitlab size={18} />
                </span>
                <span>
                  <strong>Cloudflare GitLab integration</strong>
                  <small>
                    Authorize GitLab in Cloudflare, then paste the selected repository URL.
                  </small>
                </span>
                <a
                  href="https://dash.cloudflare.com/?to=/:account/workers-and-pages/create"
                  target="_blank"
                  rel="noreferrer"
                >
                  Manage access
                </a>
              </div>
            ) : null}
            {provider === 'github' && repositories.length > 0 ? (
              <div className="repository-picker">
                <div className="repository-picker-heading">
                  <span>Available repositories</span>
                  <small>{repositories.length} scoped to this installation</small>
                </div>
                {repositories.slice(0, 6).map((repository) => (
                  <button
                    key={repository.id}
                    className={
                      repositoryUrl === repository.url
                        ? 'repository-option repository-option--active'
                        : 'repository-option'
                    }
                    type="button"
                    onClick={() => selectRepository(repository)}
                  >
                    <Github size={16} />
                    <span>
                      <strong>{repository.fullName}</strong>
                      <small>
                        {repository.language ?? 'Repository'} · {repository.defaultBranch}
                      </small>
                    </span>
                    {repository.private ? <LockKeyhole size={14} /> : <Globe2 size={14} />}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="field-label">
              <span>Repository URL</span>
              <span className="field-control">
                <Search size={16} />
                <input
                  name="repositoryUrl"
                  type="url"
                  placeholder="https://github.com/owner/repository"
                  value={repositoryUrl}
                  onChange={(event) => {
                    setRepositoryUrl(event.target.value);
                    setSelectedRepository(null);
                  }}
                  required
                />
              </span>
              <small>
                Private repositories must be included in the Cloudflare GitHub App installation.
              </small>
            </label>
          </section>
          <section className="panel wizard-section">
            <div className="section-heading">
              <div>
                <span className="step-number">2</span>
                <h2>Configure project</h2>
              </div>
            </div>
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
                    onChange={(event) => setProjectSlug(event.target.value)}
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
            <div className="compatibility-row">
              <Check size={16} />
              <span>
                <strong>Cloudflare-native pipeline</strong>
                <small>
                  WorkerDeck will detect the framework and use Workers Builds for deploys and
                  previews.
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
            <button className="button button--primary" type="submit" disabled={submitting}>
              {submitting ? 'Importing…' : 'Import and continue'}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
        <aside className="panel deployment-plan">
          <span className="eyebrow">Deployment plan</span>
          <h2>Cloudflare Worker</h2>
          <dl className="definition-list">
            <div>
              <dt>Source</dt>
              <dd>
                {provider === 'public'
                  ? 'Public Git URL'
                  : provider === 'github'
                    ? 'GitHub App'
                    : 'GitLab'}
              </dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>Global</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>Production</dd>
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
            <li>
              <span>
                <Github size={17} />
              </span>
              <div>
                <strong>Git</strong>
                <small>Scoped repository access</small>
              </div>
            </li>
            <li>
              <span>
                <Cloud size={17} />
              </span>
              <div>
                <strong>Workers Builds</strong>
                <small>Install and compile</small>
              </div>
            </li>
            <li>
              <span>
                <BrandMark className="mini-brand-mark" />
              </span>
              <div>
                <strong>Worker</strong>
                <small>Versioned upload</small>
              </div>
            </li>
            <li>
              <span>
                <Globe2 size={17} />
              </span>
              <div>
                <strong>Global</strong>
                <small>Promote after verification</small>
              </div>
            </li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
