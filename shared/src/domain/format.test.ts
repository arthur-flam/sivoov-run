import { describe, expect, it } from 'vitest';
import { formatClock, formatKm, formatOfficialTime, formatPace, parsePace } from './format';

describe('format', () => {
  it('clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59_999)).toBe('0:59');
    expect(formatClock(3_599_000)).toBe('59:59');
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatOfficialTime(1_234_000)).toBe('0:20:34');
  });
  it('pace', () => {
    expect(formatPace(330)).toBe('5:30');
    expect(formatPace(329.6)).toBe('5:30');
    expect(formatPace(null)).toBe('--:--');
    expect(parsePace('5:30')).toBe(330);
    expect(parsePace('x')).toBeNull();
  });
  it('km per locale', () => {
    expect(formatKm(10000, 'fr')).toBe('10,00 km');
    expect(formatKm(21097.5, 'en', 1)).toBe('21.1 km');
  });
});
