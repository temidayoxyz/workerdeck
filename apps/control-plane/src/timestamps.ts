const sqliteUtcTimestamp = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/;

/** Normalize SQLite UTC datetime strings before they cross the API contract. */
export function normalizeStorageTimestamp(value: string): string {
  const match = sqliteUtcTimestamp.exec(value);
  if (!match) return value;
  const fraction = match[3] ? `.${match[3]}` : '.000';
  return `${match[1]}T${match[2]}${fraction}Z`;
}

export function normalizeNullableStorageTimestamp(value: string | null): string | null {
  return value === null ? null : normalizeStorageTimestamp(value);
}
