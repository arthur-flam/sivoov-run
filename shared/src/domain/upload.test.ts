import { describe, expect, it } from 'vitest';
import { deauvilleMarathonGeometry } from '../fixtures';
import type { LocationSample } from '../schemas/run';
import { buildTrack } from './course';
import { destination } from './geo';
import { readGpxPoints } from './gpx';
import type { GpxPoint } from './gpx';
import { constantPace, simulateRun } from './simulate';
import { evaluateUpload } from './upload';

// Deauville 2026: the window is the week of the race, Paris time.
const race = { windowStart: '2026-11-09T00:00:00+01:00', windowEnd: '2026-11-15T23:59:59+01:00' };
const tenK = { distanceKey: '10k', distanceM: 10000 } as const;
const half = { distanceKey: 'half', distanceM: 21097.5 } as const;
const MONDAY_8AM = Date.parse('2026-11-10T08:00:00+01:00');
const START = { lat: 49.36, lng: 0.07 };

type Leg = { m: number; secPerKm: number };

/**
 * A runner going due north, one point a second, as a watch writes it. A straight line is what
 * makes a metre-accurate assertion possible: on a real course the tracker's 8 m steps cut corners.
 * Runs go a little past the line, as real ones do: a file ending exactly on it sums its steps to
 * a hair under the distance and never crosses it.
 */
const straight = (legs: Leg[], from = MONDAY_8AM): GpxPoint[] =>
  legs.reduce(
    (acc, leg) => {
      const n = Math.round((leg.m / 1000) * leg.secPerKm);
      const points = Array.from({ length: n }, (_, i) => ({ position: destination(START, 0, acc.m + ((i + 1) * leg.m) / n), time: acc.t + (i + 1) * 1000 }));
      return { points: [...acc.points, ...points], m: acc.m + leg.m, t: acc.t + n * 1000 };
    },
    { points: [{ position: START, time: from }] as GpxPoint[], m: 0, t: from },
  ).points;

/** What Strava or Garmin Connect export: positions and times, no accuracy, no speed. */
const toGpx = (samples: LocationSample[]): string =>
  `<?xml version="1.0"?><gpx version="1.1" creator="test"><metadata><time>${new Date(samples[0]!.timestamp).toISOString()}</time></metadata><trk><name>Course du matin</name><trkseg>${samples
    .map((s) => `<trkpt lat="${s.lat.toFixed(7)}" lon="${s.lng.toFixed(7)}"><ele>5.0</ele><time>${new Date(s.timestamp).toISOString()}</time></trkpt>`)
    .join('')}</trkseg></trk></gpx>`;

describe('an uploaded run', () => {
  it('is timed from the first point to the crossing of the distance, not to where the watch stopped', () => {
    // 10 km at 5:00/km, then a cool-down jog of 800 m before the watch is stopped.
    const verdict = evaluateUpload({ points: straight([{ m: 10_000, secPerKm: 300 }, { m: 800, secPerKm: 420 }]), course: tenK, race });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.run.distanceM).toBe(10_000);
    expect(Math.abs(verdict.run.elapsedMs - 50 * 60_000)).toBeLessThan(3000);
    expect(verdict.run.startedAt).toBe('2026-11-10T07:00:00.000Z');
    expect(Date.parse(verdict.run.finishedAt) - Date.parse(verdict.run.startedAt)).toBe(verdict.run.elapsedMs);
    expect(verdict.run.splits.map((s) => s.km)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    verdict.run.splits.forEach((s) => expect(Math.abs(s.splitMs - 300_000)).toBeLessThan(3000));
    // Every recorded point is kept for the trace, the cool-down included.
    expect(verdict.samples).toHaveLength(1 + 3000 + 336);
  });

  it('counts pauses, like a run in the app: the clock is the wall clock', () => {
    const points = straight([{ m: 10_050, secPerKm: 300 }]);
    // The watch auto-paused for five minutes at 5 km: every later point is five minutes later.
    const paused = points.map((p, i) => (i > 1500 && p.time !== null ? { ...p, time: p.time + 5 * 60_000 } : p));
    const verdict = evaluateUpload({ points: paused, course: tenK, race });
    expect(verdict.ok && Math.abs(verdict.run.elapsedMs - 55 * 60_000)).toBeLessThan(3000);
  });

  it('gets a Deauville half from the simulator, exported as a GPX, within 1 % at watch-grade noise', () => {
    const track = buildTrack(deauvilleMarathonGeometry.points);
    // The runner stops the watch a little past the line, as everyone does.
    const samples = simulateRun({ track, targetM: 21_300, pace: constantPace(330), startTime: MONDAY_8AM, noiseM: 3, seed: 7 });
    const verdict = evaluateUpload({ points: readGpxPoints(toGpx(samples)), course: half, race });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const truth = 21.0975 * 330_000;
    expect(Math.abs(verdict.run.elapsedMs - truth) / truth).toBeLessThan(0.01);
    expect(verdict.run.splits).toHaveLength(21);
  });
});

describe('an upload that is refused', () => {
  it('when the file holds no track at all', () => {
    expect(evaluateUpload({ points: readGpxPoints('<TrainingCenterDatabase/>'), course: tenK, race })).toEqual({ ok: false, reason: 'no_points' });
  });

  it('when it is a treadmill run: times, no positions', () => {
    const points = Array.from({ length: 600 }, (_, i) => ({ position: null, time: MONDAY_8AM + i * 1000 }));
    expect(evaluateUpload({ points, course: tenK, race })).toEqual({ ok: false, reason: 'no_position' });
  });

  it('when it is a course drawn on a map: positions, no times', () => {
    const points = straight([{ m: 10_000, secPerKm: 300 }]).map((p) => ({ ...p, time: null }));
    expect(evaluateUpload({ points, course: tenK, race })).toEqual({ ok: false, reason: 'no_time' });
  });

  it('when it stops short of the distance, saying how far it measured', () => {
    const verdict = evaluateUpload({ points: straight([{ m: 9_600, secPerKm: 300 }]), course: tenK, race });
    expect(verdict.ok).toBe(false);
    if (verdict.ok || verdict.reason !== 'too_short') throw new Error(`expected too_short, got ${JSON.stringify(verdict)}`);
    expect(Math.abs(verdict.distanceM - 9_600)).toBeLessThan(10);
  });

  it('credits a watch stopped on the line, which the tracker measures a hair short', () => {
    // 99.7 % of the distance: what a clean track of a curved course comes back as.
    const verdict = evaluateUpload({ points: straight([{ m: 9_970, secPerKm: 300 }]), course: tenK, race });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.run.distanceM).toBe(10_000);
    // Timed to the last point, when the watch was stopped.
    expect(verdict.run.elapsedMs).toBe(Math.round(9.97 * 300) * 1000);
  });

  it('still refuses a run one per cent short', () => {
    const verdict = evaluateUpload({ points: straight([{ m: 9_900, secPerKm: 300 }]), course: tenK, race });
    expect(verdict.ok ? 'accepted' : verdict.reason).toBe('too_short');
  });

  it('when it started before the window opened or after it closed', () => {
    const lateSunday = Date.parse('2026-11-08T23:30:00+01:00');
    expect(evaluateUpload({ points: straight([{ m: 10_000, secPerKm: 300 }], lateSunday), course: tenK, race })).toEqual({
      ok: false,
      reason: 'before_window',
      startedAt: '2026-11-08T22:30:00.000Z',
    });
    const nextMonday = Date.parse('2026-11-16T07:00:00+01:00');
    expect(evaluateUpload({ points: straight([{ m: 10_000, secPerKm: 300 }], nextMonday), course: tenK, race })).toMatchObject({ ok: false, reason: 'after_window' });
  });

  it('but not when it started inside the window and finished after it closed', () => {
    const lastEvening = Date.parse('2026-11-15T23:30:00+01:00');
    expect(evaluateUpload({ points: straight([{ m: 10_050, secPerKm: 300 }], lastEvening), course: tenK, race }).ok).toBe(true);
  });

  it('when it is faster than the world record for the distance', () => {
    // 10 km in 25:00, on a bike.
    const verdict = evaluateUpload({ points: straight([{ m: 10_050, secPerKm: 150 }]), course: tenK, race });
    expect(verdict).toMatchObject({ ok: false, reason: 'faster_than_record' });
  });

  it('when a bus carried it for part of the way, even at an ordinary average', () => {
    // 8 km running, 5 km on a bus at 43 km/h, then running to the end: 4:09/km on average, and
    // the tracker, which refuses every bus step, takes the whole ride back as one step later on.
    const points = straight([{ m: 8_000, secPerKm: 300 }, { m: 5_000, secPerKm: 84 }, { m: 8_300, secPerKm: 300 }]);
    const verdict = evaluateUpload({ points, course: half, race });
    expect(verdict).toMatchObject({ ok: false, reason: 'fast_kilometre' });
    if (verdict.ok || verdict.reason !== 'fast_kilometre') return;
    expect(verdict.km).toBeGreaterThan(8);
    expect(verdict.km).toBeLessThanOrEqual(14);
  });
});
