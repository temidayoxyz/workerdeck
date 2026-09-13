export function greetingForHour(hour: number, name?: string): string {
  const clamped = ((Math.trunc(hour) % 24) + 24) % 24;
  const salutation =
    clamped >= 5 && clamped < 12
      ? 'Good morning'
      : clamped >= 12 && clamped < 17
        ? 'Good afternoon'
        : 'Good evening';
  return name ? `${salutation}, ${name}` : `${salutation}.`;
}

export function greetingFor(date: Date, name?: string): string {
  return greetingForHour(date.getHours(), name);
}
