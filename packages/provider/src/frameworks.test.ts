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
        },
      }),
    ).toMatchObject({ framework: 'next', confidence: 'high', runtime: 'worker' });
  });

  it('detects a static HTML project', () => {
    expect(detectFramework({ files: ['index.html', 'styles.css'] })).toMatchObject({
      framework: 'static',
      runtime: 'static',
    });
  });
});
