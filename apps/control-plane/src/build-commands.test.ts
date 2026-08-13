import { describe, expect, it } from 'vitest';
import {
  managedCompatibilityDate,
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
    expect(
      managedDeployCommand(
        'npx wrangler deploy --assets dist --name=workerdeck-site --yes',
        false,
        'static',
      ),
    ).toBe(`npx wrangler deploy --assets dist --compatibility-date ${managedCompatibilityDate}`);
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
  it('builds a Vite project without mutating its repository configuration', () => {
    expect(managedBuildCommand('npm run build', 'vite')).toBe(
      'npm run build -- --configLoader runner',
    );
    expect(managedBuildCommand('npx wrangler setup --yes && npm run build', 'vite')).toBe(
      'npm run build -- --configLoader runner',
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
  it('deploys Vite output as static Worker assets without generated config', () => {
    expect(managedDeployCommand('npx wrangler deploy', false, 'vite')).toBe(
      `npx wrangler deploy --assets dist --compatibility-date ${managedCompatibilityDate}`,
    );
    expect(managedDeployCommand('npx wrangler deploy', true, 'vite')).toBe(
      `npx wrangler versions upload --assets dist --compatibility-date ${managedCompatibilityDate}`,
    );
  });

  it('preserves an explicit compatibility date', () => {
    expect(
      managedDeployCommand(
        'npx wrangler deploy --assets dist --compatibility-date 2025-04-01',
        false,
        'vite',
      ),
    ).toBe('npx wrangler deploy --assets dist --compatibility-date 2025-04-01');
  });
});
