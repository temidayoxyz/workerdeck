import type { MiddlewareHandler } from 'hono';
import { AppError } from './errors';
import type { AppEnv } from './types';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const requestContext: MiddlewareHandler<AppEnv> = async (context, next) => {
  const requestId = context.req.header('Cf-Ray') ?? crypto.randomUUID();
  context.set('requestId', requestId);
  context.header('X-Request-Id', requestId);
  await next();
};

export const securityHeaders: MiddlewareHandler<AppEnv> = async (context, next) => {
  await next();
  context.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  context.header('Cross-Origin-Opener-Policy', 'same-origin');
  context.header('Cross-Origin-Resource-Policy', 'same-origin');
  context.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  context.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  context.header('X-Content-Type-Options', 'nosniff');
  context.header('X-Frame-Options', 'DENY');
};

export const verifyMutationOrigin: MiddlewareHandler<AppEnv> = async (context, next) => {
  if (!MUTATING_METHODS.has(context.req.method)) {
    await next();
    return;
  }

  const origin = context.req.header('Origin');
  const requestOrigin = new URL(context.req.url).origin;
  const allowedOrigins = new Set([requestOrigin, context.env.DASHBOARD_ORIGIN]);

  if (!origin || !allowedOrigins.has(origin)) {
    throw new AppError(
      403,
      'INVALID_REQUEST_ORIGIN',
      'This change must originate from WorkerDeck.',
    );
  }

  await next();
};
