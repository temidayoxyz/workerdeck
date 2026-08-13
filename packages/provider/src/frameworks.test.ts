import { describe, expect, it } from 'vitest';
import { detectFramework } from './frameworks';

describe('detectFramework', () => {
  it('prefers Next.js over the underlying React toolchain', () => {
    expect(
      detectFramework({
        files: ['package.json', 'next.config.mjs'],
        packageJson: {
          dependencies: { next: '^15', react: '^19' },
          devDependencies: { vite: '^7' },
          scripts: { build: 'next build' },
        },
      }),
    ).toMatchObject({
      framework: 'next',
      displayName: 'Next.js',
      confidence: 'high',
      runtime: 'worker',
      packageManager: 'npm',
      ready: true,
      buildCommand: 'npm run build',
      deployCommand: 'npx wrangler deploy',
    });
  });

  it('detects a static HTML project', () => {
    expect(detectFramework({ files: ['index.html', 'styles.css'] })).toMatchObject({
      framework: 'static',
      runtime: 'static',
      ready: true,
      buildCommand: 'echo "No build step required"',
      deployCommand: 'npx wrangler deploy --assets .',
    });
  });

  it('uses the repository package manager and blocks incomplete Worker configuration', () => {
    expect(
      detectFramework({
        files: ['package.json', 'pnpm-lock.yaml', 'src/index.ts'],
        packageJson: { dependencies: { hono: '^4' }, scripts: { build: 'tsc' } },
      }),
    ).toMatchObject({
      framework: 'hono',
      packageManager: 'pnpm',
      buildCommand: 'pnpm run build',
      deployCommand: 'pnpm exec wrangler deploy',
      ready: false,
    });
  });

  it('identifies React projects that use Vite and their build script', () => {
    expect(
      detectFramework({
        files: ['package.json', 'package-lock.json', 'vite.config.ts'],
        packageJson: {
          dependencies: { react: '^19' },
          devDependencies: { vite: '^7', '@vitejs/plugin-react': '^5' },
          scripts: { build: 'vite build' },
        },
      }),
    ).toMatchObject({
      framework: 'vite',
      displayName: 'React + Vite',
      buildCommand: 'npm run build',
      deployCommand: 'npx wrangler deploy',
      ready: true,
    });
  });
});
