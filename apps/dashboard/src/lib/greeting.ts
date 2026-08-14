export function greetingForHour(hour: number): string {
  const clamped = ((Math.trunc(hour) % 24) + 24) % 24;
  if (clamped >= 5 && clamped < 12) return 'Good morning.';
  if (clamped >= 12 && clamped < 17) return 'Good afternoon.';
  return 'Good evening.';
}

export function greetingFor(date: Date): string {
  return greetingForHour(date.getHours());
}
