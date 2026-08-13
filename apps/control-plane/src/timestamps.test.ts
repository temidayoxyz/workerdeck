import { describe, expect, it } from 'vitest';
import { normalizeNullableStorageTimestamp, normalizeStorageTimestamp } from './timestamps';

describe('storage timestamp normalization', () => {
  it('normalizes SQLite UTC timestamps to the API ISO 8601 contract', () => {
    expect(normalizeStorageTimestamp('2026-08-13 15:27:49')).toBe('2026-08-13T15:27:49.000Z');
    expect(normalizeStorageTimestamp('2026-08-13 15:27:49.42')).toBe('2026-08-13T15:27:49.42Z');
  });

  it('leaves existing ISO timestamps and null values unchanged', () => {
    expect(normalizeStorageTimestamp('2026-08-13T15:27:49.000Z')).toBe('2026-08-13T15:27:49.000Z');
    expect(normalizeNullableStorageTimestamp(null)).toBeNull();
  });
});
