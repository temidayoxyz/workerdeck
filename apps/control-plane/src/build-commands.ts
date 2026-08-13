export const workerNameBuildVariable = 'WRANGLER_CI_OVERRIDE_NAME';
export const managedCompatibilityDate = '2026-08-12';

type ManagedFramework = 'static' | 'vite' | 'hono' | 'astro' | 'next' | 'unknown';

const openNextIdentitySetup =
  `node -e "p=require('./package.json');p.name=process.env.${workerNameBuildVariable};` +
  `require('node:fs').writeFileSync('package.json',JSON.stringify(p,null,2))"`;

export function managedBuildCommand(command: string, framework: ManagedFramework): string {
  if (framework === 'next') {
    if (command.includes(openNextIdentitySetup)) return command.trim();
    return `${openNextIdentitySetup} && npx opennextjs-cloudflare build`;
  }
  const nonMutating = command
    .replace(/(?:^|&&)\s*npx\s+wrangler\s+setup\s+--yes\s*&&\s*/g, '')
    .trim();
  if (framework === 'vite' && !/--configLoader\s+(?:runner|native)/.test(nonMutating)) {
    return `${nonMutating} -- --configLoader runner`;
  }
  return nonMutating;
}

/**
 * Keeps every connected build scoped to the Worker that WorkerDeck provisioned.
 * Workers Builds supplies the Worker name through WRANGLER_CI_OVERRIDE_NAME, so
 * command-line name overrides must not compete with framework autoconfiguration.
 */
export function managedDeployCommand(
  command: string,
  preview: boolean,
  framework: ManagedFramework = 'unknown',
): string {
  if (framework === 'next') {
    return `npx opennextjs-cloudflare ${preview ? 'upload' : 'deploy'}`;
  }
  if (!/\bwrangler\s+deploy\b/.test(command)) {
    return preview ? 'npx wrangler versions upload' : command.trim();
  }

  const managed = command
    .replace(/\s+--name(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)/g, '')
    .replace(/\s+--yes\b/g, '')
    .replace(/\bwrangler\s+deploy\b/, `wrangler ${preview ? 'versions upload' : 'deploy'}`)
    .replace(/\s+/g, ' ')
    .trim();
  if (framework === 'vite' || framework === 'static') {
    const assets = /\s--assets(?:=|\s)/.test(managed) ? managed : `${managed} --assets dist`;
    return /\s--compatibility-date(?:=|\s)/.test(assets)
      ? assets
      : `${assets} --compatibility-date ${managedCompatibilityDate}`;
  }
  return managed;
}
