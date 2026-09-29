import { describe, expect, it } from 'vitest';
import { RunSchema } from '../schemas/run';
import { officialStatus } from './official';

const MARATHON = { distanceM: 42195, distanceKey: 'marathon' as const };
const run = (over: Record<string, unknown> = {}) =>
  RunSchema.parse({
    id: 'r',
    entrantId: 'e',
    courseId: 'c',
    status: 'finished',
    source: 'app',
    distanceM: 42195,
    elapsedMs: 4 * 3600_000,
    startedAt: '2026-11-15T08:00:00Z',
    finishedAt: '2026-11-15T12:00:00Z',
    ...over,
  });

describe('official status of an uploaded run', () => {
  it('keeps a finish that covered the course distance', () => {
    expect(officialStatus(run(), MARATHON)).toBe('finished');
  });
  it('turns a finish claimed short of the distance into an abandon', () => {
    expect(officialStatus(run({ distanceM: 400 }), MARATHON)).toBe('abandoned');
  });
  it('never makes a simulated run official', () => {
    expect(officialStatus(run({ source: 'simulation' }), MARATHON)).toBe('abandoned');
  });
  it('leaves the other statuses alone', () => {
    expect(officialStatus(run({ status: 'abandoned', distanceM: 400 }), MARATHON)).toBe('abandoned');
    expect(officialStatus(run({ status: 'running', distanceM: 400 }), MARATHON)).toBe('running');
  });
  it('refuses a time faster than the world record', () => {
    expect(officialStatus(run({ elapsedMs: 60_000, finishedAt: '2026-11-15T08:01:00Z' }), MARATHON)).toBe('abandoned');
  });
  it('refuses a kilometre no runner holds: a bus or a car in the middle of the run', () => {
    expect(officialStatus(run({ splits: [{ km: 1, elapsedMs: 330_000, splitMs: 330_000 }, { km: 2, elapsedMs: 420_000, splitMs: 90_000 }] }), MARATHON)).toBe('abandoned');
  });
  it('refuses more running time than passed between the start and the finish', () => {
    expect(officialStatus(run({ finishedAt: '2026-11-15T10:00:00Z' }), MARATHON)).toBe('abandoned');
    expect(officialStatus(run({ finishedAt: '2026-11-15T11:59:30Z' }), MARATHON)).toBe('finished');
  });
});
