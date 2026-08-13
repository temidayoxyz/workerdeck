import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import { AppError } from './errors';
import type { AppEnv } from './types';

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeTeamDomain(value: string): string {
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function isLocalRequest(url: URL): boolean {
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
}

export const authenticate: MiddlewareHandler<AppEnv> = async (context, next) => {
  const { AUTH_MODE, ENVIRONMENT } = context.env;

  if (AUTH_MODE === 'development') {
    if (ENVIRONMENT !== 'development' || !isLocalRequest(new URL(context.req.url))) {
      throw new AppError(
        500,
        'UNSAFE_AUTH_CONFIGURATION',
        'Development authentication is only available on localhost.',
      );
    }
    context.set('actor', context.req.header('X-WorkerDeck-Dev-Actor') ?? 'developer@local');
    await next();
    return;
  }

  const token = context.req.header('Cf-Access-Jwt-Assertion');
  const teamDomainValue = context.env.ACCESS_TEAM_DOMAIN;
  const audience = context.env.ACCESS_AUD;

  if (!token || !teamDomainValue || !audience) {
    throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authenticate through Cloudflare Access.');
  }

  const teamDomain = normalizeTeamDomain(teamDomainValue);
  const issuer = `https://${teamDomain}`;
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, jwks);
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      algorithms: ['RS256'],
    });
    const actor = typeof payload.email === 'string' ? payload.email : payload.sub;
    if (!actor) {
      throw new Error('The Access token does not contain an actor identity.');
    }
    context.set('actor', actor);
  } catch {
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Your Cloudflare Access session is invalid.');
  }

  await next();
};
