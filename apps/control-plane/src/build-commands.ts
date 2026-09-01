import type { Framework } from '@workerdeck/contracts';

export const workerNameBuildVariable = 'WRANGLER_CI_OVERRIDE_NAME';
export const managedCompatibilityDate = '2026-08-12';

type ManagedFramework = Framework;

const openNextIdentitySetup =
  `node -e "p=require('./package.json');p.name=process.env.${workerNameBuildVariable};` +
  `require('node:fs').writeFileSync('package.json',JSON.stringify(p,null,2))"`;

export function managedBuildCommand(command: string, framework: ManagedFramework): string {
  if (framework === 'next') {
    if (command.includes(openNextIdentitySetup)) return command.trim();
    return `${openNextIdentitySetup} && npx opennextjs-cloudflare build`;
  }
  let nonMutating = command
    .replace(/(?:^|&&)\s*npx\s+wrangler\s+setup\s+--yes\s*&&\s*/g, '')
    .trim();
  if (framework === 'vite') {
    // Older WorkerDeck releases forced Vite's experimental runner config loader.
    // Besides being unnecessary for ordinary projects, runner executes ESM configs
    // without the compatibility transform used by Vite's default bundled loader.
    // Remove only the legacy value WorkerDeck injected; preserve an explicit user
    // choice such as `--configLoader native` or `--configLoader bundle`.
    nonMutating = nonMutating
      .replace(/\s+--configLoader(?:=|\s+)runner\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const baseArgument = /\s--base(?:=|\s)/.test(nonMutating) ? '' : '--base /';
    if (!baseArgument) return nonMutating;
    return /(?:^|\s)--(?:\s|$)/.test(nonMutating)
      ? `${nonMutating} ${baseArgument}`
      : `${nonMutating} -- ${baseArgument}`;
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
  const staticDirectory: Partial<Record<Framework, string>> = {
    vite: 'dist',
    static: '.',
    docusaurus: 'build',
    vitepress: '.vitepress/dist',
    gatsby: 'public',
  };
  const defaultDirectory = staticDirectory[framework];
  if (defaultDirectory !== undefined) {
    const assetsMatch = managed.match(/(?:^|\s)--assets(?:=|\s+)(?:"([^"]*)"|'([^']*)'|(\S+))/);
    const directory =
      outputDirectory?.trim() ||
      assetsMatch?.[1] ||
      assetsMatch?.[2] ||
      assetsMatch?.[3] ||
      defaultDirectory;
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
