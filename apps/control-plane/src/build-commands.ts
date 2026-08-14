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
  if (framework === 'vite') {
    const args = [
      /--configLoader\s+(?:runner|native)/.test(nonMutating) ? '' : '--configLoader runner',
      /\s--base(?:=|\s)/.test(nonMutating) ? '' : '--base /',
    ]
      .filter(Boolean)
      .join(' ');
    if (!args) return nonMutating;
    return /(?:^|\s)--(?:\s|$)/.test(nonMutating)
      ? `${nonMutating} ${args}`
      : `${nonMutating} -- ${args}`;
  }
  return nonMutating;
}

function assetsConfigSetup(directory: string): string {
  return (
    `node -e "require('node:fs').writeFileSync('workerdeck.assets.jsonc',` +
    `JSON.stringify({assets:{directory:'${directory}',not_found_handling:'single-page-application'},` +
    `compatibility_date:'${managedCompatibilityDate}'}))"`
  );
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
  outputDirectory?: string | null,
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
    const assetsMatch = managed.match(/(?:^|\s)--assets(?:=|\s+)(?:"([^"]*)"|'([^']*)'|(\S+))/);
    const directory =
      outputDirectory?.trim() ||
      assetsMatch?.[1] ||
      assetsMatch?.[2] ||
      assetsMatch?.[3] ||
      (framework === 'static' ? '.' : 'dist');
    const base = managed
      .replace(/(?:^|\s)node\s+-e\s+"[^"]*workerdeck\.assets\.jsonc[^"]*"\s*&&/g, '')
      .replace(/\s+--config(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)/g, '')
      .replace(/\s+--assets(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)/g, '')
      .replace(/\s+--compatibility-date(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `${assetsConfigSetup(directory)} && ${base} --config workerdeck.assets.jsonc`;
  }
  return managed;
}
