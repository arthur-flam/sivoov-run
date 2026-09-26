import { describe, expect, it } from 'vitest';
import { daysUntilWindow, isRanked, startedInWindow, windowPhase } from './raceWindow';

// Deauville 2026: the window is the week of the race, Paris time.
const race = { windowStart: '2026-11-09T00:00:00+01:00', windowEnd: '2026-11-15T23:59:59+01:00' };

describe('the race window', () => {
  it('opens at midnight Paris time, not UTC', () => {
    expect(windowPhase(race, Date.parse('2026-11-08T22:59:59Z'))).toBe('before');
    expect(windowPhase(race, Date.parse('2026-11-08T23:00:00Z'))).toBe('open');
  });
  it('closes after the last second of race day', () => {
    expect(windowPhase(race, Date.parse('2026-11-15T22:59:59Z'))).toBe('open');
    expect(windowPhase(race, Date.parse('2026-11-15T23:00:00Z'))).toBe('after');
  });
  it('counts the days left before it opens, and none once it has', () => {
    expect(daysUntilWindow(race, Date.parse('2026-11-01T12:00:00Z'))).toBe(8);
    expect(daysUntilWindow(race, Date.parse('2026-11-10T12:00:00Z'))).toBe(0);
  });
});

describe('what counts as an official result', () => {
  it('ranks a finish started during race week', () => {
    expect(isRanked(race, { status: 'finished', startedAt: '2026-11-15T09:00:00.000Z' })).toBe(true);
    expect(isRanked(race, { status: 'uploaded', startedAt: '2026-11-12T06:30:00+01:00' })).toBe(true);
  });
  it('keeps a rehearsal the week before out of the results, however fast', () => {
    expect(isRanked(race, { status: 'finished', startedAt: '2026-11-01T09:00:00.000Z' })).toBe(false);
  });
  it('keeps a run started after the window closed out too', () => {
    expect(isRanked(race, { status: 'finished', startedAt: '2026-11-16T09:00:00.000Z' })).toBe(false);
  });
  it('never ranks an abandon, or a run with no start time', () => {
    expect(isRanked(race, { status: 'abandoned', startedAt: '2026-11-15T09:00:00.000Z' })).toBe(false);
    expect(startedInWindow(race, undefined)).toBe(false);
  });
});
