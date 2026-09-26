import { describe, expect, it } from 'vitest';
import { RunDiagnosticsSchema, RunTraceSchema, SplitSchema } from '../schemas/index';
import { deauvilleMarathonGeometry } from '../fixtures';
import { buildTrack, positionAtDistance } from './course';
import { haversineM } from './geo';
import { constantPace, simulateRun } from './simulate';
import { applySample, idleRun, startRun } from './tracker';
import { isRanked } from './raceWindow';
import { fixTally, heardRows, kmMarks, lastStretch, readableEventId, runVerdict, splitRows } from './runReview';

const split = (km: number, splitMs: number, elapsedMs: number) => SplitSchema.parse({ km, splitMs, elapsedMs });

describe('runVerdict', () => {
  // Deauville 2026: the window is the week of the race, Paris time.
  const race = { windowStart: '2026-11-09T00:00:00+01:00', windowEnd: '2026-11-15T23:59:59+01:00' };
  const own = { window: race, ownDistance: true };
  const inWindow = '2026-11-12T09:00:00+01:00';
  it('counts a real run that reached the finish inside the window, sent by the app or as a file', () => {
    expect(runVerdict({ status: 'finished', source: 'app', startedAt: inWindow }, false, own)).toBe('counts');
    expect(runVerdict({ status: 'uploaded', source: 'upload', startedAt: inWindow }, false, own)).toBe('counts');
  });
  it('says why anything else does not count, the organizer’s decision first', () => {
    expect(runVerdict({ status: 'finished', source: 'app', startedAt: inWindow }, true, own)).toBe('excluded');
    expect(runVerdict({ status: 'abandoned', source: 'simulation', startedAt: inWindow }, false, own)).toBe('simulated');
    expect(runVerdict({ status: 'abandoned', source: 'app', startedAt: inWindow }, false, own)).toBe('stopped');
    expect(runVerdict({ status: 'running', source: 'app', startedAt: inWindow }, false, own)).toBe('running');
    expect(runVerdict({ status: 'planned', source: 'app' }, false, own)).toBe('planned');
  });
  it('calls a finish before the window a rehearsal and one after it too late, whatever the distance', () => {
    expect(runVerdict({ status: 'finished', source: 'app', startedAt: '2026-10-18T09:00:00+02:00' }, false, own)).toBe('rehearsal');
    expect(runVerdict({ status: 'uploaded', source: 'upload', startedAt: '2026-11-20T09:00:00+01:00' }, false, own)).toBe('closed');
    expect(runVerdict({ status: 'finished', source: 'app', startedAt: '2026-10-18T09:00:00+02:00' }, false, { ...own, ownDistance: false })).toBe('rehearsal');
    expect(runVerdict({ status: 'finished', source: 'app' }, false, own)).toBe('rehearsal');
  });
  it('never counts a finish on another distance than the runner’s own, as the results do not', () => {
    const run = { status: 'finished', source: 'app', startedAt: inWindow } as const;
    expect(runVerdict(run, false, { ...own, ownDistance: false })).toBe('other_distance');
    expect(isRanked(race, run)).toBe(true); // the window alone would rank it: the distance is what stops it
  });
  it('agrees with isRanked on the window, to the second', () => {
    const edges = [race.windowStart, race.windowEnd].flatMap((iso) => [-1000, 0, 1000].map((d) => new Date(Date.parse(iso) + d).toISOString()));
    edges.forEach((startedAt) => {
      const run = { status: 'finished', source: 'app', startedAt } as const;
      expect(runVerdict(run, false, own) === 'counts').toBe(isRanked(race, run));
    });
  });
});

describe('splitRows', () => {
  const splits = [split(1, 300_000, 300_000), split(2, 290_000, 590_000), split(3, 330_000, 920_000), split(4, 290_000, 1_210_000)];
  it('gives each kilometre its pace and marks the fastest and the slowest once', () => {
    const rows = splitRows(splits);
    expect(rows.map((r) => r.paceSecPerKm)).toEqual([300, 290, 330, 290]);
    expect(rows.map((r) => r.fastest)).toEqual([false, true, false, false]);
    expect(rows.map((r) => r.slowest)).toEqual([false, false, true, false]);
  });
  it('draws the slowest kilometre full width and keeps small differences visible', () => {
    const rows = splitRows(splits);
    expect(rows[2]!.share).toBe(1);
    // 290 s against a floor of 232 s and a slowest of 330 s.
    expect(rows[1]!.share).toBeCloseTo(58 / 98, 5);
    rows.forEach((r) => expect(r.share).toBeGreaterThan(0));
  });
  it('marks nothing when every kilometre took the same time, or with too few to compare', () => {
    const even = splitRows([split(1, 300_000, 300_000), split(2, 300_000, 600_000), split(3, 300_000, 900_000)]);
    expect(even.some((r) => r.fastest || r.slowest)).toBe(false);
    expect(even.every((r) => r.share === 1)).toBe(true);
    const two = splitRows([split(1, 300_000, 300_000), split(2, 290_000, 590_000)]);
    expect(two.some((r) => r.fastest || r.slowest)).toBe(false);
    expect(splitRows([])).toEqual([]);
  });
});

describe('lastStretch', () => {
  it('is the 97.5 m after kilometre 21 of a half', () => {
    const splits = Array.from({ length: 21 }, (_, i) => split(i + 1, 300_000, (i + 1) * 300_000));
    const last = lastStretch(splits, { elapsedMs: 21 * 300_000 + 30_000, distanceM: 21097.5 });
    expect(last?.meters).toBeCloseTo(97.5);
    expect(last?.ms).toBe(30_000);
    expect(last?.paceSecPerKm).toBeCloseTo(307.7, 1);
  });
  it('is the whole run when it never reached a kilometre, and nothing when the run ends on one', () => {
    expect(lastStretch([], { elapsedMs: 120_000, distanceM: 400 })).toEqual({ meters: 400, ms: 120_000, paceSecPerKm: 300 });
    expect(lastStretch([split(1, 300_000, 300_000)], { elapsedMs: 300_000, distanceM: 1000 })).toBeNull();
  });
});

describe('kmMarks', () => {
  const track = buildTrack(deauvilleMarathonGeometry.points);
  const start = Date.UTC(2026, 10, 12, 8, 0, 0);
  const samples = simulateRun({ track, targetM: 3200, pace: constantPace(300), startTime: start });
  it('puts each kilometre where the runner was when the split was taken', () => {
    const state = samples.reduce((s, sample) => applySample(s, sample), startRun(idleRun(3000), start));
    const marks = kmMarks(samples, state.splits, start);
    expect(marks.map((m) => m.km)).toEqual([1, 2, 3]);
    marks.forEach((m) => expect(haversineM(m.point, positionAtDistance(track, m.km * 1000).point)).toBeLessThan(15));
  });
  it('falls back to the distance along the fixes when the run has no splits', () => {
    const marks = kmMarks(samples, [], start);
    expect(marks.map((m) => m.km)).toEqual([1, 2, 3]);
    marks.forEach((m) => expect(haversineM(m.point, positionAtDistance(track, m.km * 1000).point)).toBeLessThan(15));
  });
  it('has nothing to mark without at least two fixes', () => {
    expect(kmMarks(samples.slice(0, 1), [split(1, 1, 1)], start)).toEqual([]);
  });
});

describe('heardRows', () => {
  const trace = RunTraceSchema.parse({
    runId: 'r',
    samples: [],
    audioFired: [
      { eventId: 'course.planches', distanceM: 200, elapsedMs: 60_000 },
      { eventId: 'ceremony.gun', distanceM: 0, elapsedMs: 0 },
      { eventId: 'personal.split', distanceM: 1000, elapsedMs: 300_000 },
      { eventId: 'personal.split', distanceM: 2000, elapsedMs: 600_000 },
      { eventId: 'personal.split', distanceM: 3000, elapsedMs: 900_000 },
    ],
  });
  it('lists announcements in the order they played, with their published title', () => {
    const rows = heardRows(trace.audioFired, new Map([['ceremony.gun', 'Le départ'], ['course.planches', 'Les Planches']]));
    expect(rows.map((r) => r.title)).toEqual(['Le départ', 'Les Planches', 'Split']);
  });
  it('folds an announcement that repeats into one row with a count', () => {
    const split = heardRows(trace.audioFired, new Map()).find((r) => r.eventId === 'personal.split')!;
    expect(split).toMatchObject({ times: 3, distanceM: 1000, lastDistanceM: 3000, elapsedMs: 300_000 });
  });
  it('makes an unnamed event readable', () => {
    expect(readableEventId('course.saint-arnoult')).toBe('Saint arnoult');
    expect(readableEventId('gun')).toBe('Gun');
    expect(readableEventId('personal.split#12')).toBe('Split');
  });
});

describe('fixTally', () => {
  it('reads what the phone kept and threw away from its log', () => {
    const diagnostics = RunDiagnosticsSchema.parse({
      lines: [
        { atMs: 0, tag: 'location', message: 'background updates started' },
        { atMs: 6_000_000, tag: 'run', message: 'finished: 6312 accepted, 41 rejected, 6353 samples, 21098 m' },
      ],
    });
    expect(fixTally(diagnostics)).toEqual({ accepted: 6312, rejected: 41 });
  });
  it('is unknown when the log does not say', () => {
    expect(fixTally(undefined)).toBeNull();
    expect(fixTally(RunDiagnosticsSchema.parse({ lines: [{ atMs: 0, tag: 'run', message: 'start' }] }))).toBeNull();
  });
});
