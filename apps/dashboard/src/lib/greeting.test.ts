import { describe, expect, it } from 'vitest';
import { greetingFor, greetingForHour } from './greeting';

describe('greetingForHour', () => {
  it('greets the morning from 5am to noon', () => {
    expect(greetingForHour(5)).toBe('Good morning.');
    expect(greetingForHour(9)).toBe('Good morning.');
    expect(greetingForHour(11)).toBe('Good morning.');
  });

  it('greets the afternoon from noon to 5pm', () => {
    expect(greetingForHour(12)).toBe('Good afternoon.');
    expect(greetingForHour(16)).toBe('Good afternoon.');
  });

  it('greets the evening otherwise, including overnight', () => {
    expect(greetingForHour(17)).toBe('Good evening.');
    expect(greetingForHour(23)).toBe('Good evening.');
    expect(greetingForHour(3)).toBe('Good evening.');
  });

  it('normalizes out-of-range hours', () => {
    expect(greetingForHour(29)).toBe('Good morning.');
    expect(greetingForHour(-1)).toBe('Good evening.');
  });

  it('uses the local hour of the supplied date', () => {
    expect(greetingFor(new Date(2026, 7, 14, 8, 30))).toBe('Good morning.');
  });
});
