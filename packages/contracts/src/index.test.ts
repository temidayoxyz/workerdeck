import { describe, expect, it } from 'vitest';
import { createResourceInputSchema, managedResourceSchema, resourceKindSchema } from './index';

const projectId = '9e05e925-61dc-4e35-bec3-3f97df1f7d59';
const environmentId = '117c25cd-b3d9-43b4-ae82-c29f76754810';

describe('createResourceInputSchema', () => {
  it('accepts the original named resource kinds', () => {
    for (const kind of ['d1', 'kv', 'r2', 'queue'] as const) {
      const parsed = createResourceInputSchema.safeParse({
        projectId,
        environmentId,
        kind,
        name: 'northstar-data',
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('accepts a Hyperdrive origin without losing its password', () => {
    const parsed = createResourceInputSchema.safeParse({
      projectId,
      environmentId,
      kind: 'hyperdrive',
      name: 'checkout-postgres',
      origin: {
        database: 'checkout',
        host: 'db.example.com',
        password: 'super-secret',
        port: 5432,
        scheme: 'postgres',
        user: 'checkout_user',
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.kind === 'hyperdrive') {
      expect(parsed.data.origin.password).toBe('super-secret');
    }
  });

  it('accepts Vectorize, AI Gateway, and Workflow configurations', () => {
    expect(
      createResourceInputSchema.safeParse({
        projectId,
        environmentId,
        kind: 'vectorize',
        name: 'product-embeddings',
        dimensions: 1536,
        metric: 'cosine',
      }).success,
    ).toBe(true);
    expect(
      createResourceInputSchema.safeParse({
        projectId,
        environmentId,
        kind: 'ai_gateway',
        name: 'model-gateway',
        cacheTtl: 300,
        collectLogs: true,
      }).success,
    ).toBe(true);
    expect(
      createResourceInputSchema.safeParse({
        projectId,
        environmentId,
        kind: 'workflow',
        name: 'order-saga',
        className: 'OrderSaga',
        scriptName: 'workerdeck-orders-api',
      }).success,
    ).toBe(true);
  });

  it('adopts Durable Object namespaces by provider id', () => {
    const parsed = createResourceInputSchema.safeParse({
      projectId,
      environmentId,
      kind: 'durable_object',
      name: 'checkout-sessions',
      cloudflareId: 'namespace-id',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.kind === 'durable_object') {
      expect(parsed.data.cloudflareId).toBe('namespace-id');
    }
  });

  it('rejects invalid storage expansion payloads', () => {
    expect(
      createResourceInputSchema.safeParse({
        projectId,
        environmentId,
        kind: 'hyperdrive',
        name: 'checkout-postgres',
        origin: {
          database: 'checkout',
          host: 'db.example.com',
          port: 5432,
          scheme: 'postgres',
          user: 'checkout_user',
        },
      }).success,
    ).toBe(false);
    expect(
      createResourceInputSchema.safeParse({
        projectId,
        environmentId,
        kind: 'durable_object',
        name: 'checkout-sessions',
      }).success,
    ).toBe(false);
  });
});

describe('managed resource contracts', () => {
  it('accepts every expanded resource kind and lifecycle status', () => {
    expect(resourceKindSchema.safeParse('hyperdrive').success).toBe(true);
    expect(resourceKindSchema.safeParse('vectorize').success).toBe(true);
    expect(resourceKindSchema.safeParse('ai_gateway').success).toBe(true);
    expect(resourceKindSchema.safeParse('durable_object').success).toBe(true);
    expect(
      managedResourceSchema.safeParse({
        id: '4f408826-01fa-41e6-9027-f63565dd9224',
        projectId,
        environmentId,
        kind: 'hyperdrive',
        cloudflareId: 'hyperdrive-id',
        name: 'checkout-postgres',
        ownershipTag: 'workerdeck:ownership',
        status: 'active',
        createdAt: '2026-08-14T12:00:00.000Z',
        deletedAt: null,
      }).success,
    ).toBe(true);
  });
});
