import { describe, expect, it } from 'vitest';
import { RunSchema } from '../schemas/run';
import { averagePace, bestRankedRun, finishOutcome } from './finish';

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

describe('the best official run the phone knows of', () => {
  const run = (id: string, startedAt: string, elapsedMs: number, over: Record<string, unknown> = {}) =>
    RunSchema.parse({ id, entrantId: 'e', courseId: 'c', status: 'finished', source: 'app', startedAt, elapsedMs, distanceM: HALF, ...over });
  it('is the fastest finish of race week', () => {
    const best = bestRankedRun(window, HALF, [run('a', '2026-11-10T08:00:00Z', 6_600_000), run('b', '2026-11-14T08:00:00Z', 6_300_000)]);
    expect(best?.id).toBe('b');
  });
  it('ignores a faster rehearsal, a simulation and a run stopped short', () => {
    const best = bestRankedRun(window, HALF, [
      run('rehearsal', '2026-10-01T08:00:00Z', 5_000_000),
      run('sim', '2026-11-10T08:00:00Z', 5_000_000, { source: 'simulation' }),
      run('short', '2026-11-11T08:00:00Z', 1_000_000, { distanceM: 5000 }),
      run('real', '2026-11-12T08:00:00Z', 6_900_000),
    ]);
    expect(best?.id).toBe('real');
  });
  it('is nothing before any finish', () => {
    expect(bestRankedRun(window, HALF, [])).toBeNull();
  });
});
