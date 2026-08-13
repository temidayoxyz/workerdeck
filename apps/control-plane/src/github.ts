import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';
import { AppError } from './errors';

const installationSchema = z.object({
  id: z.number().int().positive(),
  account: z.object({ login: z.string(), type: z.string() }),
});

const repositoriesSchema = z.object({
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

export class GitHubAppClient {
  constructor(
    private readonly appId: string,
    private readonly privateKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async getInstallation(installationId: string) {
    return installationSchema.parse(
      await this.request(
        `/app/installations/${encodeURIComponent(installationId)}`,
        await this.appJwt(),
      ),
    );
  }

  async listRepositories(installationId: string) {
    const appJwt = await this.appJwt();
    const tokenResponse = z
      .object({ token: z.string(), expires_at: z.string() })
      .parse(
        await this.request(
          `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
          appJwt,
          { method: 'POST', body: JSON.stringify({ permissions: { metadata: 'read' } }) },
        ),
      );
    const result = repositoriesSchema.parse(
      await this.request('/installation/repositories?per_page=100', tokenResponse.token),
    );
    return result.repositories.map((repository) => ({
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
