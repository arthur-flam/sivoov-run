import { describe, expect, it } from 'vitest';
import { formatClock, formatDistanceAway, formatDistanceLine, formatKm, formatOfficialKm, formatPlaceKm, formatMegabytes, formatOfficialTime, formatPace, parsePace } from './format';

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
  it('official distances the way runners know them, never "10,000 km"', () => {
    expect(formatOfficialKm(42195, 'marathon', 'fr')).toBe('42,195 km');
    expect(formatOfficialKm(21097.5, 'half', 'fr')).toBe('21,1 km');
    expect(formatOfficialKm(10000, '10k', 'fr')).toBe('10 km');
    expect(formatPlaceKm(3900, 'fr')).toBe('3,9 km');
    expect(formatPlaceKm(30000, 'en')).toBe('30 km');
  });
  it('the bib names the distance once: "10 km", not "10 km · 10,0 km"', () => {
    expect(formatDistanceLine(10000, '10k', 'fr')).toBe('10 km');
    expect(formatDistanceLine(21097.5, 'half', 'fr')).toBe('Semi-marathon · 21,1 km');
    expect(formatDistanceLine(42195, 'marathon', 'en')).toBe('Marathon · 42.195 km');
  });
  it('how far away the next place is: meters to the nearest ten, then kilometres', () => {
    expect(formatDistanceAway(347, 'fr')).toBe('350 m');
    expect(formatDistanceAway(2, 'fr')).toBe('10 m');
    expect(formatDistanceAway(996, 'fr')).toBe('1,0 km');
    expect(formatDistanceAway(1240, 'en')).toBe('1.2 km');
  });
  it('download size per locale, a tiny pack still showing a size', () => {
    expect(formatMegabytes(1_850_000, 'fr')).toBe('1,9 Mo');
    expect(formatMegabytes(1_850_000, 'en')).toBe('1.9 MB');
    expect(formatMegabytes(12_000, 'fr')).toBe('0,1 Mo');
  });
});

