import { describe, expect, it } from 'vitest';
import { diagnoseBuildFailure } from './build-diagnostics';

describe('diagnoseBuildFailure', () => {
  it('identifies the legacy WorkerDeck Vite runner override', () => {
    const diagnosis = diagnoseBuildFailure([
      'Executing user build command: npm run build -- --configLoader runner --base /',
      'ReferenceError: __dirname is not defined',
    ]);
    expect(diagnosis).toMatchObject({ code: 'VITE_RUNNER_CONFIG_INCOMPATIBLE' });
    expect(diagnosis?.remediation).toContain('default bundled config loader');
  });

  it('explains a CommonJS __dirname failure under ESM config loading', () => {
    const diagnosis = diagnoseBuildFailure([
      'failed to load config from /opt/buildhome/repo/vite.config.ts',
      'ReferenceError: __dirname is not defined',
    ]);
    expect(diagnosis?.code).toBe('VITE_ESM_DIRNAME');
    expect(diagnosis?.title).toContain('__dirname');
    expect(diagnosis?.remediation).toContain('import.meta.dirname');
  });

  it('explains dependency installation failures', () => {
    expect(
      diagnoseBuildFailure(['npm ERR! code ERESOLVE', 'npm ERR! could not resolve dependency']),
    ).toMatchObject({ code: 'DEPENDENCY_INSTALL_FAILED' });
  });

  it('explains TypeScript compile failures', () => {
    expect(
      diagnoseBuildFailure(['src/app.tsx(12,5): error TS2307: Cannot find module']),
    ).toMatchObject({ code: 'TYPESCRIPT_ERROR' });
  });

  it('prioritizes the __dirname explanation over the generic config-load failure', () => {
    expect(
      diagnoseBuildFailure([
        'failed to load config from /opt/buildhome/repo/vite.config.ts',
        'ReferenceError: __dirname is not defined',
      ])?.code,
    ).toBe('VITE_ESM_DIRNAME');
  });

  it('returns null for healthy logs', () => {
    expect(
      diagnoseBuildFailure(['vite v7.0.0 building for production...', 'built in 3.2s']),
    ).toBeNull();
  });
});
