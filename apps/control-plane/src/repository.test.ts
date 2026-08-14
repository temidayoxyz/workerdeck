import { describe, expect, it } from 'vitest';
import { canonicalRepositoryKey, previewUrlForDeployment } from './repository';

describe('canonicalRepositoryKey', () => {
  it('normalizes equivalent repository URLs to one identity', () => {
    expect(canonicalRepositoryKey('https://github.com/Temidayoxyz/Lastsignal.git')).toBe(
      'github.com:temidayoxyz/lastsignal',
    );
    expect(canonicalRepositoryKey('https://www.github.com/temidayoxyz/lastsignal/')).toBe(
      'github.com:temidayoxyz/lastsignal',
    );
  });
});

describe('previewUrlForDeployment', () => {
  const previewEnvironment = { kind: 'preview' as const, worker_name: 'workerdeck-demo' };
  const productionUrl = 'https://workerdeck-demo.example-subdomain.workers.dev';

  it('builds a versioned workers.dev preview URL from the production hostname', () => {
    expect(
      previewUrlForDeployment(
        { worker_version_id: '4e5f6a78c1d2e3f4a5b6c7d8' },
        previewEnvironment,
        productionUrl,
      ),
    ).toBe('https://4e5f6a78-workerdeck-demo.example-subdomain.workers.dev');
  });

  it('returns null for production deployments', () => {
    expect(
      previewUrlForDeployment(
        { worker_version_id: '4e5f6a78c1d2e3f4a5b6c7d8' },
        { kind: 'production', worker_name: 'workerdeck-demo' },
        productionUrl,
      ),
    ).toBeNull();
  });

  it('returns null when a version, worker name, or subdomain is missing', () => {
    expect(
      previewUrlForDeployment({ worker_version_id: null }, previewEnvironment, productionUrl),
    ).toBeNull();
    expect(
      previewUrlForDeployment(
        { worker_version_id: '4e5f6a78c1d2e3f4a5b6c7d8' },
        { kind: 'preview', worker_name: null },
        productionUrl,
      ),
    ).toBeNull();
    expect(
      previewUrlForDeployment(
        { worker_version_id: '4e5f6a78c1d2e3f4a5b6c7d8' },
        previewEnvironment,
        null,
      ),
    ).toBeNull();
  });

  it('ignores production URLs that do not belong to the worker', () => {
    expect(
      previewUrlForDeployment(
        { worker_version_id: '4e5f6a78c1d2e3f4a5b6c7d8' },
        previewEnvironment,
        'https://someone-else.workers.dev',
      ),
    ).toBeNull();
  });
});
