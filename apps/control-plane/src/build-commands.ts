export const workerNameBuildVariable = 'WRANGLER_CI_OVERRIDE_NAME';

type ManagedFramework = 'static' | 'vite' | 'hono' | 'astro' | 'next' | 'unknown';

const openNextIdentitySetup =
  `node -e "p=require('./package.json');p.name=process.env.${workerNameBuildVariable};` +
  `require('node:fs').writeFileSync('package.json',JSON.stringify(p,null,2))"`;

export function managedBuildCommand(command: string, framework: ManagedFramework): string {
  if (framework === 'next') {
    if (command.includes(openNextIdentitySetup)) return command.trim();
    return `${openNextIdentitySetup} && npx wrangler setup --yes && npx opennextjs-cloudflare build`;
  }
  if (/\bwrangler\s+setup\s+--yes\b/.test(command)) return command.trim();
  return `npx wrangler setup --yes && ${command.trim()}`;
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

  return command
    .replace(/\s+--name(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)/g, '')
    .replace(/\s+--yes\b/g, '')
    .replace(/\bwrangler\s+deploy\b/, `wrangler ${preview ? 'versions upload' : 'deploy'}`)
    .replace(/\s+/g, ' ')
    .trim();
}
