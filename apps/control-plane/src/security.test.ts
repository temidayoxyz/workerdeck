import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { requestContext, securityHeaders, verifyMutationOrigin } from './security';
import type { AppEnv, Bindings } from './types';

function testBindings(): Bindings {
  return {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    ENVIRONMENT: 'production',
    AUTH_MODE: 'cloudflare-access',
    DASHBOARD_ORIGIN: 'https://dashboard.example.com',
    CLOUDFLARE_ACCOUNT_NAME: 'Test account',
  };
}

function securedApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requestContext);
  app.use('*', securityHeaders);
  app.use('*', verifyMutationOrigin);
  app.get('/resource', (context) => context.json({ ok: true }));
  app.post('/resource', (context) => context.json({ ok: true }));
  app.onError((error, context) => {
    const appError = error instanceof AppError ? error : null;
    return context.json({ code: appError?.code ?? 'INTERNAL_ERROR' }, appError?.status ?? 500);
  });
  return app;
}

describe('request security', () => {
  it('rejects cross-origin mutations', async () => {
    const response = await securedApp().request(
      'https://dashboard.example.com/resource',
      { method: 'POST', headers: { Origin: 'https://attacker.example' } },
      testBindings(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'INVALID_REQUEST_ORIGIN' });
  });

  it('accepts dashboard-origin mutations and emits hardened headers', async () => {
    const response = await securedApp().request(
      'https://api.example.com/resource',
      { method: 'POST', headers: { Origin: 'https://dashboard.example.com' } },
      testBindings(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('does not require an Origin header for read-only requests', async () => {
    const response = await securedApp().request(
      'https://dashboard.example.com/resource',
      { method: 'GET' },
      testBindings(),
    );

    expect(response.status).toBe(200);
  });
});
