import { describe, expect, it } from 'vitest';
import { canonicalRepositoryKey } from './repository';

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
