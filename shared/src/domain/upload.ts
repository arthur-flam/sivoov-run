import type { Course } from '../schemas/course';
import type { DistanceKey, Race } from '../schemas/race';
import type { LocationSample, Split } from '../schemas/run';
import type { GpxPoint } from './gpx';
import { windowPhase } from './raceWindow';
import { applySample, idleRun, startRun } from './tracker';

/**
 * Nobody has covered these distances faster. The men's road world records in September 2026
 * are 1:59:30 (marathon), 56:51 (half), 26:31 (10 km) and 12:49 (5 km); each is rounded down
 * to the minute, so the next record never makes a champion look like a bicycle.
 */
const RECORD_FLOOR_MS: Record<DistanceKey, number> = {
  marathon: 119 * 60_000,
  half: 56 * 60_000,
  '10k': 26 * 60_000,
  '5k': 12 * 60_000,
};

/**
 * No kilometre under 2:10: the 1000 m world record is 2:11.83 (2026), on a track. This is the
 * check that catches a bus or a car in the middle of a run: the tracker refuses steps above
 * 10 m/s, but a ride followed by a wait comes back as one long step, and its kilometres come
 * out at a speed no runner holds.
 */
const FASTEST_KILOMETRE_MS = 130_000;

export type UploadedRun = { startedAt: string; finishedAt: string; elapsedMs: number; distanceM: number; splits: Split[] };

export type UploadRefusal =
  /** Not a GPX, or a GPX with no track in it. */
  | { reason: 'no_points' }
  /** Times and no positions: a treadmill or an indoor recording. */
  | { reason: 'no_position' }
  /** Positions and no times: a route drawn on a map, not a recorded run. */
  | { reason: 'no_time' }
  | { reason: 'before_window'; startedAt: string }
  | { reason: 'after_window'; startedAt: string }
  /** What the tracker measured, short of the course distance. */
  | { reason: 'too_short'; distanceM: number }
  | { reason: 'faster_than_record'; elapsedMs: number }
  | { reason: 'fast_kilometre'; km: number; splitMs: number };

export type UploadVerdict = { ok: true; run: UploadedRun; samples: LocationSample[] } | ({ ok: false } & UploadRefusal);

export type UploadInput = {
  points: GpxPoint[];
  course: Pick<Course, 'distanceKey' | 'distanceM'>;
  race: Pick<Race, 'windowStart' | 'windowEnd'>;
};

/**
 * A runner's own recording, judged like a run in the app: the points are replayed through the
 * same tracker, from the first timed point (the gun) to the moment the course distance is
 * reached (the finish mat), wherever the watch was stopped after that. Pauses count, as in the
 * app. A GPX carries no accuracy and no Doppler speed: the tracker then uses its default
 * accuracy and the positions alone, which it already does for any fix without them.
 */
export const evaluateUpload = ({ points, course, race }: UploadInput): UploadVerdict => {
  if (points.length === 0) return { ok: false, reason: 'no_points' };
  if (!points.some((p) => p.position)) return { ok: false, reason: 'no_position' };
  const samples = points.flatMap((p): LocationSample[] => (p.position && p.time !== null ? [{ ...p.position, timestamp: p.time }] : []));
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || last.timestamp <= first.timestamp) return { ok: false, reason: 'no_time' };

  const startedAt = new Date(first.timestamp).toISOString();
  const phase = windowPhase(race, first.timestamp);
  if (phase !== 'open') return { ok: false, reason: phase === 'before' ? 'before_window' : 'after_window', startedAt };

  const state = samples.reduce((s, sample) => applySample(s, sample), startRun(idleRun(course.distanceM), first.timestamp));
  if (state.phase !== 'finished') return { ok: false, reason: 'too_short', distanceM: state.distanceM };
  if (state.elapsedMs < RECORD_FLOOR_MS[course.distanceKey]) return { ok: false, reason: 'faster_than_record', elapsedMs: state.elapsedMs };
  const fast = state.splits.find((s) => s.splitMs < FASTEST_KILOMETRE_MS);
  if (fast) return { ok: false, reason: 'fast_kilometre', km: fast.km, splitMs: fast.splitMs };

  const run = {
    startedAt,
    finishedAt: new Date(first.timestamp + state.elapsedMs).toISOString(),
    elapsedMs: state.elapsedMs,
    distanceM: state.distanceM,
    splits: state.splits,
  };
  return { ok: true, run, samples };
};
