import { describe, expect, it } from 'vitest';
import {
  managedBuildCommand,
  managedDeployCommand,
  workerNameBuildVariable,
} from './build-commands';

describe('managedDeployCommand', () => {
  it('leaves production autoconfiguration unscoped for the CI name override', () => {
    expect(
      managedDeployCommand('npx wrangler deploy --yes --name workerdeck-lastsignal', false),
    ).toBe('npx wrangler deploy');
  });

  it('preserves static asset arguments while removing protected flags', () => {
    const managed = managedDeployCommand(
      'npx wrangler deploy --assets dist --name=workerdeck-site --yes',
      false,
      'static',
    );
    expect(managed).toContain('workerdeck.assets.jsonc');
    expect(managed).toContain("directory:'dist'");
    expect(managed).toContain('single-page-application');
    expect(managed).not.toContain('--name');
    expect(managed).not.toContain('--yes');
    expect(managed).not.toContain('--assets');
  });

  it('turns a production Wrangler command into a non-promoting preview upload', () => {
    expect(managedDeployCommand('pnpm exec wrangler deploy --keep-vars --yes', true)).toBe(
      'pnpm exec wrangler versions upload --keep-vars',
    );
  });

  it('uses the safe Wrangler preview default for custom production commands', () => {
    expect(managedDeployCommand('npm run deploy:custom', true)).toBe(
      'npx wrangler versions upload',
    );
  });

  it('uses the OpenNext commands for Next.js production and previews', () => {
    expect(managedDeployCommand('npx wrangler deploy --yes', false, 'next')).toBe(
      'npx opennextjs-cloudflare deploy',
    );
    expect(managedDeployCommand('npx wrangler deploy --yes', true, 'next')).toBe(
      'npx opennextjs-cloudflare upload',
    );
  });
});

describe('managedBuildCommand', () => {
  it('builds a Vite project with its compatible default config loader', () => {
    expect(managedBuildCommand('npm run build', 'vite')).toBe('npm run build -- --base /');
    expect(managedBuildCommand('npx wrangler setup --yes && npm run build', 'vite')).toBe(
      'npm run build -- --base /',
    );
  });

  it('keeps a Vite project base path when the command already pins one', () => {
    expect(managedBuildCommand('npm run build -- --base /docs', 'vite')).toBe(
      'npm run build -- --base /docs',
    );
  });

  it('repairs the incompatible runner loader in existing Vite build triggers', () => {
    expect(managedBuildCommand('npm run build -- --configLoader runner --base /', 'vite')).toBe(
      'npm run build -- --base /',
    );
    expect(managedBuildCommand('npm run build -- --configLoader=runner', 'vite')).toBe(
      'npm run build -- --base /',
    );
  });

  it('preserves an explicitly selected supported Vite config loader', () => {
    expect(managedBuildCommand('npm run build -- --configLoader native', 'vite')).toBe(
      'npm run build -- --configLoader native --base /',
    );
  });

  it('builds Next.js with OpenNext without running interactive setup in CI', () => {
    const command = managedBuildCommand('npm run build', 'next');
    expect(command).not.toContain('wrangler setup');
    expect(command).toContain('WRANGLER_CI_OVERRIDE_NAME');
    expect(command).toContain('p.name=process.env.WRANGLER_CI_OVERRIDE_NAME');
    expect(command).toContain('npx opennextjs-cloudflare build');
    expect(command.length).toBeLessThanOrEqual(500);
    expect(managedBuildCommand(command, 'next')).toBe(command);
  });

  it('keeps managed commands idempotent', () => {
    const command = managedBuildCommand('npm run build', 'vite');
    expect(managedBuildCommand(command, 'vite')).toBe(command);
    expect(workerNameBuildVariable).toBe('WRANGLER_CI_OVERRIDE_NAME');
  });
});

describe('managed Vite deployment', () => {
  it('deploys Vite output as an SPA-fallback assets-only Worker', () => {
    const production = managedDeployCommand('npx wrangler deploy', false, 'vite');
    expect(production).toContain("directory:'dist'");
    expect(production).toContain("not_found_handling:'single-page-application'");
    expect(production).toContain('wrangler deploy --config workerdeck.assets.jsonc');

    const preview = managedDeployCommand('npx wrangler deploy', true, 'vite');
    expect(preview).toContain('wrangler versions upload --config workerdeck.assets.jsonc');
  });

  it('honors a per-project output directory override', () => {
    expect(managedDeployCommand('npx wrangler deploy', false, 'vite', 'out/web')).toContain(
      "directory:'out/web'",
    );
    expect(managedDeployCommand('npx wrangler deploy', false, 'static')).toContain("directory:'.'");
  });

  it('is idempotent so reconciliation never stacks managed flags', () => {
    const once = managedDeployCommand('npx wrangler deploy', false, 'vite');
    expect(managedDeployCommand(once, false, 'vite')).toBe(once);
  });

  it('repairs a trigger that already received a duplicated managed command', () => {
    const once = managedDeployCommand('npx wrangler deploy', false, 'vite');
    const setup = once.split(' && ')[0];
    const duplicated = `${setup} && ${setup} && npx wrangler deploy --config workerdeck.assets.jsonc --config workerdeck.assets.jsonc`;
    expect(managedDeployCommand(duplicated, false, 'vite')).toBe(once);
  });
});
