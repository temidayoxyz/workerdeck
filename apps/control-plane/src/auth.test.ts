import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { authenticate } from './auth';
import { AppError } from './errors';
import type { AppEnv, Bindings } from './types';

function testBindings(overrides: Partial<Bindings> = {}): Bindings {
  return {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    ENVIRONMENT: 'development',
    AUTH_MODE: 'development',
    DASHBOARD_ORIGIN: 'http://127.0.0.1:5173',
    CLOUDFLARE_ACCOUNT_NAME: 'Test account',
    ...overrides,
  };
}

function authenticatedApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', authenticate);
  app.get('*', (context) => context.json({ actor: context.get('actor') }));
  app.onError((error, context) => {
    const appError = error instanceof AppError ? error : null;
    return context.json({ code: appError?.code ?? 'INTERNAL_ERROR' }, appError?.status ?? 500);
  });
  return app;
}

describe('authentication boundary', () => {
  it('allows development authentication only on localhost', async () => {
    const app = authenticatedApp();
    const response = await app.request(
      'http://127.0.0.1/api/v1/dashboard',
      { headers: { 'X-WorkerDeck-Dev-Actor': 'developer@example.com' } },
      testBindings(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ actor: 'developer@example.com' });
  });

  it('fails closed when development authentication reaches a public host', async () => {
    const app = authenticatedApp();
    const response = await app.request(
      'https://dashboard.example.com/api/v1/dashboard',
      {},
      testBindings(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ code: 'UNSAFE_AUTH_CONFIGURATION' });
  });

  it('requires an Access assertion in production', async () => {
    const app = authenticatedApp();
    const response = await app.request(
      'https://dashboard.example.com/api/v1/dashboard',
      {},
      testBindings({
        AUTH_MODE: 'cloudflare-access',
        ENVIRONMENT: 'production',
        ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
        ACCESS_AUD: 'access-audience',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'AUTHENTICATION_REQUIRED' });
  });
});
