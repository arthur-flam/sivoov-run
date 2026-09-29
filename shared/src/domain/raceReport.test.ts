import { describe, expect, it } from 'vitest';
import type { Run } from '../schemas/run';
import { checkpointLabel, checkpointMeters, checkpointStep, elapsedAt, placeMarks, raceReport } from './raceReport';

const HALF = 21097.5;

/** A run at an even pace per kilometre (ms), finishing on the official distance. */
const evenRun = (id: string, kmMs: number[], officialM = HALF): Pick<Run, 'id' | 'elapsedMs' | 'splits'> => {
  const elapsed = kmMs.reduce<number[]>((acc, ms) => [...acc, (acc[acc.length - 1] ?? 0) + ms], []);
  const tail = ((officialM % 1000) / 1000) * kmMs[kmMs.length - 1]!;
  return { id, elapsedMs: Math.round(elapsed[elapsed.length - 1]! + tail), splits: kmMs.map((ms, i) => ({ km: i + 1, splitMs: ms, elapsedMs: elapsed[i]! })) };
};

describe('the timing points of a course', () => {
  it('stands every 5 km on a marathon and a half, every 2 on a 10 km, every km on a 5 km', () => {
    expect(checkpointStep(42195)).toBe(5);
    expect(checkpointStep(HALF)).toBe(5);
    expect(checkpointStep(10000)).toBe(2);
    expect(checkpointStep(5000)).toBe(1);
  });
  it('ends on the finish, and never puts a point on top of it', () => {
    expect(checkpointMeters(42195)).toEqual([5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 42195]);
    expect(checkpointMeters(HALF)).toEqual([5000, 10000, 15000, 20000, HALF]);
    expect(checkpointMeters(10000)).toEqual([2000, 4000, 6000, 8000, 10000]);
  });
  it('labels the finish with its distance, the French way: 42,195 on a marathon, 21,1 on a half', () => {
    expect(checkpointLabel(5000, 42195, 'fr')).toBe('5');
    expect(checkpointLabel(42195, 42195, 'fr')).toBe('42,195');
    expect(checkpointLabel(HALF, HALF, 'fr')).toBe('21,1');
    expect(checkpointLabel(10000, 10000, 'en')).toBe('10');
  });
});

describe('the clock at a point of the course', () => {
  const run = evenRun('me', Array(21).fill(300_000));
  it('is the kilometre split on a kilometre, and the official time at the finish', () => {
    expect(elapsedAt(run, HALF, 5000)).toBe(1_500_000);
    expect(elapsedAt(run, HALF, HALF)).toBe(run.elapsedMs);
  });
  it('is read between two kilometres anywhere else (the half-way point)', () => {
    expect(elapsedAt(run, HALF, HALF / 2)).toBe(Math.round(10548.75 * 300));
  });
  it('is not guessed across a run without splits', () => {
    expect(elapsedAt({ elapsedMs: 6_000_000, splits: [] }, HALF, 5000)).toBeNull();
  });
});

describe('a finisher’s race report', () => {
  // Paul starts at 5:00/km and finishes at 4:00/km; Zoé runs 4:50 all the way.
  const paul = evenRun('paul', [...Array(10).fill(300_000), ...Array(11).fill(240_000)]);
  const zoe = evenRun('zoe', Array(21).fill(290_000));

  it('has a row per timing point with the time, the segment and its pace', () => {
    const report = raceReport(paul, HALF);
    expect(report.checkpoints.map((c) => c.meters)).toEqual([5000, 10000, 15000, 20000, HALF]);
    expect(report.checkpoints[0]).toMatchObject({ elapsedMs: 1_500_000, segmentMs: 1_500_000, paceSecPerKm: 300, finish: false });
    expect(report.checkpoints[2]).toMatchObject({ elapsedMs: 4_200_000, segmentMs: 1_200_000, paceSecPerKm: 240 });
    expect(report.checkpoints[4]!.finish).toBe(true);
  });

  it('says nothing of other runners: nobody is ranked', () => {
    expect(Object.keys(raceReport(paul, HALF))).toEqual(['checkpoints', 'halves']);
    expect(Object.keys(raceReport(paul, HALF).checkpoints[0]!)).not.toContain('place');
  });

  it('calls a second half quicker than the first a negative split', () => {
    const halves = raceReport(paul, HALF).halves!;
    expect(halves.secondMs).toBeLessThan(halves.firstMs);
    expect(halves.negative).toBe(true);
    expect(halves.gainMs).toBe(halves.firstMs - halves.secondMs);
    expect(raceReport(zoe, HALF).halves!.negative).toBe(false);
  });

  it('is the finish alone for a run sent without splits', () => {
    const report = raceReport({ elapsedMs: 6_000_000, splits: [] }, HALF);
    expect(report.checkpoints).toEqual([expect.objectContaining({ meters: HALF, finish: true, elapsedMs: 6_000_000 })]);
    expect(report.halves).toBeNull();
  });
});

describe('timing point circles on the drawing', () => {
  const across = { nx: 0, ny: 1 };
  it('sit on the course where there is room', () => {
    const marks = placeMarks([{ x: 50, y: 50, ...across }, { x: 150, y: 50, ...across }], 10, { width: 300, height: 300 });
    expect(marks.map((m) => [m.x, m.y])).toEqual([[50, 50], [150, 50]]);
  });
  it('step off the line where a second loop passes the same street', () => {
    const marks = placeMarks([{ x: 50, y: 50, ...across }, { x: 52, y: 50, ...across }], 10, { width: 300, height: 300 });
    expect(Math.hypot(marks[1]!.x - marks[0]!.x, marks[1]!.y - marks[0]!.y)).toBeGreaterThanOrEqual(21);
    expect(marks[1]).toMatchObject({ atX: 52, atY: 50 });
  });
});
