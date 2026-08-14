import { describe, expect, it } from 'vitest';
import {
  cacheExpressionFor,
  cacheRulesetRulesFor,
  distinctCacheZones,
  mergeZoneCacheRules,
  parseRevalidationTimestamp,
  revalidationKeyFor,
} from './cache';

describe('cacheRulesetRulesFor', () => {
  it('maps WorkerDeck rules onto set_cache_settings payloads', () => {
    const rules = cacheRulesetRulesFor([
      {
        id: '11111111-1111-4111-8111-111111111111',
        pathExpression: '/blog/*',
        edgeTtlSeconds: 3600,
        browserTtlSeconds: 600,
        enabled: true,
        syncedAt: null,
        syncError: null,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        pathExpression: '/api/*',
        edgeTtlSeconds: 0,
        browserTtlSeconds: null,
        enabled: false,
        syncedAt: null,
        syncError: null,
      },
    ]);
    expect(rules).toEqual([
      {
        id: 'workerdeck-cache:11111111-1111-4111-8111-111111111111',
        description: 'WorkerDeck: /blog/*',
        expression: 'http.request.uri.path wildcard "/blog/*"',
        enabled: true,
        action: 'set_cache_settings',
        action_parameters: {
          cache: true,
          edge_ttl: { mode: 'override_origin', default: 3600 },
          browser_ttl: { mode: 'override_origin', default: 600 },
        },
      },
      {
        id: 'workerdeck-cache:22222222-2222-4222-8222-222222222222',
        description: 'WorkerDeck: /api/*',
        expression: 'http.request.uri.path wildcard "/api/*"',
        enabled: false,
        action: 'set_cache_settings',
        action_parameters: { cache: false },
      },
    ]);
  });

  it('builds a path wildcard expression without requiring escaping', () => {
    expect(cacheExpressionFor('/docs/getting-started/*')).toBe(
      'http.request.uri.path wildcard "/docs/getting-started/*"',
    );
  });
});

describe('mergeZoneCacheRules', () => {
  it('keeps foreign zone rules and replaces only WorkerDeck-owned rules', () => {
    const merged = mergeZoneCacheRules(
      [
        { id: 'foreign-rule', action: 'set_cache_settings' },
        { id: 'workerdeck-cache:stale', action: 'set_cache_settings' },
      ],
      [{ id: 'workerdeck-cache:current', action: 'set_cache_settings' }],
    );
    expect(merged).toEqual([
      { id: 'foreign-rule', action: 'set_cache_settings' },
      { id: 'workerdeck-cache:current', action: 'set_cache_settings' },
    ]);
  });
});

describe('revalidation hints', () => {
  it('namespaces hint keys per path pattern', () => {
    expect(revalidationKeyFor('/blog/*')).toBe('workerdeck:revalidate:/blog/*');
  });

  it('parses a revalidation timestamp from a KV hint value', () => {
    expect(parseRevalidationTimestamp('{"at":"2026-08-13T12:00:00.000Z"}')).toBe(
      '2026-08-13T12:00:00.000Z',
    );
    expect(parseRevalidationTimestamp(null)).toBeNull();
    expect(parseRevalidationTimestamp('not-json')).toBeNull();
    expect(parseRevalidationTimestamp('{"at":42}')).toBeNull();
    expect(parseRevalidationTimestamp('{"at":"not-a-date"}')).toBeNull();
  });
});

describe('distinctCacheZones', () => {
  it('groups domains into sorted zones without duplicating hostnames', () => {
    expect(
      distinctCacheZones([
        { zoneId: 'z2', zoneName: 'beta.example.com', hostname: 'app.beta.example.com' },
        { zoneId: 'z1', zoneName: 'example.com', hostname: 'example.com' },
        { zoneId: 'z1', zoneName: 'example.com', hostname: 'www.example.com' },
        { zoneId: 'z1', zoneName: 'example.com', hostname: 'example.com' },
      ]),
    ).toEqual([
      { zoneId: 'z2', zoneName: 'beta.example.com', hostnames: ['app.beta.example.com'] },
      { zoneId: 'z1', zoneName: 'example.com', hostnames: ['example.com', 'www.example.com'] },
    ]);
  });
});
