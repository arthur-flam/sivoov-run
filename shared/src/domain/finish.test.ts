import { describe, expect, it } from 'vitest';
import { averagePace, finishOutcome } from './finish';

const window = { windowStart: '2026-11-09T00:00:00+01:00', windowEnd: '2026-11-15T23:59:59+01:00' };
const HALF = 21097.5;
const raceSunday = Date.parse('2026-11-15T09:00:00Z');

describe('what the finish line tells the runner', () => {
  it('calls a full distance run during race week official', () => {
    expect(finishOutcome({ distanceM: HALF, courseDistanceM: HALF, startedAtMs: raceSunday, window })).toBe('official');
  });
  it('calls the same run a rehearsal the week before, so nobody expects a ranking', () => {
    expect(finishOutcome({ distanceM: HALF, courseDistanceM: HALF, startedAtMs: Date.parse('2026-10-01T09:00:00Z'), window })).toBe('rehearsal');
  });
  it('says the race is closed for a run started after the window', () => {
    expect(finishOutcome({ distanceM: HALF, courseDistanceM: HALF, startedAtMs: Date.parse('2026-11-20T09:00:00Z'), window })).toBe('closed');
  });
  it('never calls a run stopped short a finish, even during race week', () => {
    expect(finishOutcome({ distanceM: HALF - 1, courseDistanceM: HALF, startedAtMs: raceSunday, window })).toBe('incomplete');
  });
  it('previews race day when there is no window to hold it against', () => {
    expect(finishOutcome({ distanceM: HALF, courseDistanceM: HALF, startedAtMs: Date.parse('2026-10-01T09:00:00Z'), window: null })).toBe('official');
  });
});

describe('average pace', () => {
  it('is the whole time over the whole distance, in seconds per kilometre', () => {
    expect(averagePace(6_330_000, HALF)).toBeCloseTo(300.03, 1);
  });
  it('is unknown before the first metre', () => {
    expect(averagePace(10_000, 0)).toBeNull();
  });
});
