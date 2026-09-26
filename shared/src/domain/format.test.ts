import { describe, expect, it } from 'vitest';
import { formatClock, formatKm, formatMegabytes, formatOfficialTime, formatPace, formatRank, parsePace } from './format';

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
  it('download size per locale, a tiny pack still showing a size', () => {
    expect(formatMegabytes(1_850_000, 'fr')).toBe('1,9 Mo');
    expect(formatMegabytes(1_850_000, 'en')).toBe('1.9 MB');
    expect(formatMegabytes(12_000, 'fr')).toBe('0,1 Mo');
  });
});

describe('rank on a results page', () => {
  it('reads like a French results table', () => {
    expect(formatRank(1, 'fr')).toBe('1er');
    expect(formatRank(12, 'fr')).toBe('12e');
  });
  it('uses English ordinals, teens included', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map((n) => formatRank(n, 'en'))).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
  });
});
