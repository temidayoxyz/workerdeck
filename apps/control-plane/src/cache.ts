import type { CacheRule } from '@workerdeck/contracts';

const WORKERDECK_RULE_ID_PREFIX = 'workerdeck-cache:';

export function cacheRuleProviderId(ruleId: string): string {
  return `${WORKERDECK_RULE_ID_PREFIX}${ruleId}`;
}

export function isWorkerDeckCacheRule(rule: Record<string, unknown>): boolean {
  return typeof rule.id === 'string' && rule.id.startsWith(WORKERDECK_RULE_ID_PREFIX);
}

export function cacheExpressionFor(pathExpression: string): string {
  return `http.request.uri.path wildcard "${pathExpression}"`;
}

export function cacheRulesetRulesFor(rules: CacheRule[]): Array<Record<string, unknown>> {
  return rules.map((rule) => {
    const bypass = rule.edgeTtlSeconds === 0;
    const actionParameters: Record<string, unknown> = { cache: !bypass };
    if (!bypass) {
      actionParameters.edge_ttl = { mode: 'override_origin', default: rule.edgeTtlSeconds };
      if (rule.browserTtlSeconds !== null) {
        actionParameters.browser_ttl = {
          mode: 'override_origin',
          default: rule.browserTtlSeconds,
        };
      }
    }
    return {
      id: cacheRuleProviderId(rule.id),
      description: `WorkerDeck: ${rule.pathExpression}`,
      expression: cacheExpressionFor(rule.pathExpression),
      enabled: rule.enabled,
      action: 'set_cache_settings',
      action_parameters: actionParameters,
    };
  });
}

export function mergeZoneCacheRules(
  existing: Array<Record<string, unknown>>,
  managed: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return [...existing.filter((rule) => !isWorkerDeckCacheRule(rule)), ...managed];
}

export function revalidationKeyFor(pathExpression: string): string {
  return `workerdeck:revalidate:${pathExpression}`;
}

export const revalidationGenerationKey = 'workerdeck:revalidate:generation';

export function parseRevalidationTimestamp(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'at' in parsed &&
      typeof (parsed as { at?: unknown }).at === 'string'
    ) {
      const at = (parsed as { at: string }).at;
      return Number.isNaN(Date.parse(at)) ? null : at;
    }
    return null;
  } catch {
    return null;
  }
}

export function distinctCacheZones(
  domains: Array<{ zoneId: string; zoneName: string; hostname: string }>,
): Array<{ zoneId: string; zoneName: string; hostnames: string[] }> {
  const byZone = new Map<string, { zoneId: string; zoneName: string; hostnames: string[] }>();
  for (const domain of domains) {
    const zone = byZone.get(domain.zoneId) ?? {
      zoneId: domain.zoneId,
      zoneName: domain.zoneName,
      hostnames: [],
    };
    if (!zone.hostnames.includes(domain.hostname)) zone.hostnames.push(domain.hostname);
    byZone.set(domain.zoneId, zone);
  }
  return [...byZone.values()].sort((left, right) => left.zoneName.localeCompare(right.zoneName));
}
