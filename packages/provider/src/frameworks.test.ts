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

  it('detects Cloudflare-adapter Worker frameworks', () => {
    const cases = [
      { dependency: '@sveltejs/kit', framework: 'sveltekit', displayName: 'SvelteKit' },
      { dependency: '@remix-run/dev', framework: 'remix', displayName: 'Remix' },
      { dependency: 'nuxt', framework: 'nuxt', displayName: 'Nuxt' },
      { dependency: '@builder.io/qwik', framework: 'qwik', displayName: 'Qwik City' },
      { dependency: '@react-router/dev', framework: 'react-router', displayName: 'React Router' },
      { dependency: '@analogjs/platform', framework: 'analog', displayName: 'Analog' },
      { dependency: 'nitropack', framework: 'nitro', displayName: 'Nitro' },
    ];
    for (const candidate of cases) {
      expect(
        detectFramework({
          files: ['package.json'],
          packageJson: {
            dependencies: { [candidate.dependency]: 'latest' },
            scripts: { build: 'build' },
          },
        }),
      ).toMatchObject({
        framework: candidate.framework,
        displayName: candidate.displayName,
        runtime: 'worker',
        ready: true,
        deployCommand: 'npx wrangler deploy',
      });
    }
  });

  it('detects static site generators with their build output directories', () => {
    expect(
      detectFramework({
        files: ['package.json'],
        packageJson: {
          dependencies: { '@docusaurus/core': '^3' },
          scripts: { build: 'docusaurus build' },
        },
      }),
    ).toMatchObject({ framework: 'docusaurus', runtime: 'static', outputDirectory: 'build' });

    expect(
      detectFramework({
        files: ['package.json'],
        packageJson: {
          devDependencies: { vitepress: '^1' },
          scripts: { 'docs:build': 'vitepress build docs' },
        },
      }),
    ).toMatchObject({
      framework: 'vitepress',
      runtime: 'static',
      outputDirectory: '.vitepress/dist',
      buildCommand: 'npm run docs:build',
    });

    expect(
      detectFramework({
        files: ['package.json'],
        packageJson: { dependencies: { gatsby: '^5' }, scripts: { build: 'gatsby build' } },
      }),
    ).toMatchObject({ framework: 'gatsby', runtime: 'static', outputDirectory: 'public' });
  });

  it('detects Cloudflare Python Workers', () => {
    expect(
      detectFramework({
        files: ['main.py', 'requirements.txt', 'wrangler.jsonc'],
      }),
    ).toMatchObject({
      framework: 'python',
      runtime: 'worker',
      ready: true,
      buildCommand: 'pip install -r requirements.txt',
      deployCommand: 'npx wrangler deploy',
    });
  });
});
