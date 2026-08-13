export function relativeTime(value: string | null): string {
  if (!value) return 'Not started';
  const elapsedSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(elapsedSeconds) >= seconds)
      return formatter.format(Math.round(elapsedSeconds / seconds), unit);
  }
  return formatter.format(elapsedSeconds, 'second');
}

export function shortSha(value: string | null): string {
  return value?.slice(0, 7) ?? '—';
}

export function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
