import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';
import { detectFramework, type FrameworkDetection } from '@workerdeck/provider';
import { AppError } from './errors';

const installationSchema = z.object({
  id: z.number().int().positive(),
  account: z.object({ login: z.string(), type: z.string() }),
});

const installationsSchema = z.array(installationSchema);

const repositoriesSchema = z.object({
  total_count: z.number().int().nonnegative(),
  repositories: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      full_name: z.string(),
      private: z.boolean(),
      html_url: z.url(),
      default_branch: z.string(),
      language: z.string().nullable(),
      pushed_at: z.string().nullable(),
      owner: z.object({ login: z.string(), id: z.number().int().positive() }),
    }),
  ),
});

const treeSchema = z.object({
  truncated: z.boolean().optional().default(false),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.enum(['blob', 'tree', 'commit']),
      size: z.number().optional(),
    }),
  ),
});

const contentSchema = z.object({
  type: z.literal('file'),
  encoding: z.literal('base64'),
  content: z.string(),
});

export class GitHubAppClient {
  constructor(
    private readonly appId: string,
    private readonly privateKey: string,
    private readonly fetcher: typeof fetch = (...arguments_) => fetch(...arguments_),
  ) {}

  async getInstallation(installationId: string) {
    return installationSchema.parse(
      await this.request(
        `/app/installations/${encodeURIComponent(installationId)}`,
        await this.appJwt(),
      ),
    );
  }

  async listInstallations() {
    return installationsSchema.parse(
      await this.request('/app/installations?per_page=100', await this.appJwt()),
    );
  }

  async listRepositories(installationId: string) {
    const token = await this.installationToken(installationId, { metadata: 'read' });
    const repositories: z.infer<typeof repositoriesSchema>['repositories'] = [];
    for (let page = 1; page <= 10; page += 1) {
      const result = repositoriesSchema.parse(
        await this.request(`/installation/repositories?per_page=100&page=${page}`, token),
      );
      repositories.push(...result.repositories);
      if (repositories.length >= result.total_count || result.repositories.length < 100) break;
    }
    return repositories.map((repository) => ({
      id: String(repository.id),
      ownerId: String(repository.owner.id),
      owner: repository.owner.login,
      name: repository.name,
      fullName: repository.full_name,
      private: repository.private,
      url: repository.html_url,
      defaultBranch: repository.default_branch,
      language: repository.language,
      pushedAt: repository.pushed_at,
    }));
  }

  async inspectRepository(
    installationId: string,
    repository: { id: string; owner: string; name: string; defaultBranch: string },
  ): Promise<FrameworkDetection & { rootDirectory: string }> {
    const token = await this.installationToken(installationId, {
      metadata: 'read',
      contents: 'read',
    });
    const repositoryPath = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
    const tree = treeSchema.parse(
      await this.request(
        `${repositoryPath}/git/trees/${encodeURIComponent(repository.defaultBranch)}?recursive=1`,
        token,
      ),
    );
    const files = tree.tree
      .filter((entry) => entry.type === 'blob')
      .map((entry) => entry.path)
      .slice(0, 20_000);
    const packagePaths = files
      .filter(
        (file) => file === 'package.json' || /^(?:apps|packages)\/[^/]+\/package\.json$/.test(file),
      )
      .slice(0, 24);
    const candidates = await Promise.all(
      (packagePaths.length > 0 ? packagePaths : [null]).map(async (packagePath) => {
        const rootDirectory = packagePath
          ? packagePath.replace(/\/?package\.json$/, '') || '/'
          : '/';
        const rootedFiles = filesForRoot(files, rootDirectory);
        const packageJson = packagePath
          ? await this.readPackageJson(repositoryPath, packagePath, repository.defaultBranch, token)
          : undefined;
        return {
          rootDirectory,
          detection: detectFramework({
            files: rootedFiles,
            ...(packageJson ? { packageJson } : {}),
          }),
        };
      }),
    );
    const ranked = candidates.sort(
      (left, right) =>
        detectionScore(right) - detectionScore(left) ||
        left.rootDirectory.length - right.rootDirectory.length,
    );
    const selected = ranked[0] ?? {
      rootDirectory: '/',
      detection: detectFramework({ files }),
    };
    const supportedRoots = ranked.filter(
      (candidate) => candidate.detection.framework !== 'unknown',
    );
    return {
      ...selected.detection,
      rootDirectory: selected.rootDirectory,
      warnings: [
        ...selected.detection.warnings,
        ...(tree.truncated
          ? ['GitHub truncated the repository tree; verify the detected root directory.']
          : []),
        ...(supportedRoots.length > 1
          ? [
              `Detected ${supportedRoots.length} deployable workspaces; selected ${selected.rootDirectory}.`,
            ]
          : []),
      ],
    };
  }

  private async readPackageJson(
    repositoryPath: string,
    packagePath: string,
    branch: string,
    token: string,
  ) {
    const value = contentSchema.parse(
      await this.request(
        `${repositoryPath}/contents/${packagePath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
        token,
      ),
    );
    const decoded = Uint8Array.from(atob(value.content.replace(/\s/g, '')), (character) =>
      character.charCodeAt(0),
    );
    const parsed = z
      .object({
        dependencies: z.record(z.string(), z.string()).optional(),
        devDependencies: z.record(z.string(), z.string()).optional(),
        scripts: z.record(z.string(), z.string()).optional(),
      })
      .parse(JSON.parse(new TextDecoder().decode(decoded)));
    return {
      ...(parsed.dependencies ? { dependencies: parsed.dependencies } : {}),
      ...(parsed.devDependencies ? { devDependencies: parsed.devDependencies } : {}),
      ...(parsed.scripts ? { scripts: parsed.scripts } : {}),
    };
  }

  private async installationToken(
    installationId: string,
    permissions: Record<string, 'read'>,
  ): Promise<string> {
    const result = z
      .object({ token: z.string(), expires_at: z.string() })
      .parse(
        await this.request(
          `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
          await this.appJwt(),
          { method: 'POST', body: JSON.stringify({ permissions }) },
        ),
      );
    return result.token;
  }

  private async appJwt(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(this.privateKey.replace(/\\n/g, '\n'), 'RS256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(now - 30)
      .setExpirationTime(now + 540)
      .setIssuer(this.appId)
      .sign(key);
  }

  private async request(path: string, token: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'WorkerDeck',
        'X-GitHub-Api-Version': '2026-03-10',
        ...init.headers,
      },
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AppError(
        response.status === 404 ? 404 : 502,
        'GITHUB_APP_ERROR',
        response.status === 404
          ? 'This GitHub App installation is not available.'
          : 'GitHub could not complete the repository request.',
      );
    }
    return payload;
  }
}

function filesForRoot(files: string[], rootDirectory: string): string[] {
  if (rootDirectory === '/') return files;
  const prefix = `${rootDirectory}/`;
  return files.filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length));
}

function detectionScore(candidate: {
  detection: FrameworkDetection;
  rootDirectory: string;
}): number {
  const confidence = { high: 30, medium: 20, low: 0 }[candidate.detection.confidence];
  return (
    confidence + (candidate.detection.ready ? 10 : 0) + (candidate.rootDirectory === '/' ? 2 : 0)
  );
}
