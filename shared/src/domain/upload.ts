import type { Course } from '../schemas/course';
import type { Race } from '../schemas/race';
import type { LocationSample, Split } from '../schemas/run';
import type { GpxPoint } from './gpx';
import { FASTEST_KILOMETRE_MS, RECORD_FLOOR_MS } from './official';
import { windowPhase } from './raceWindow';
import { applySample, idleRun, startRun } from './tracker';
import type { RunState } from './tracker';

/**
 * A watch stopped on the finish line, replayed through the tracker, measures a little short:
 * its 8 m steps cut the corners (0.24 % on a clean 1 Hz track of Deauville's half). Within
 * this margin the runner is credited the distance and timed to the last point, which is when
 * they stopped the watch. A marathon's margin is 211 m, under a minute at any racing pace.
 */
export const UPLOAD_DISTANCE_TOLERANCE = 0.005;

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
 * A replay that stopped within the tolerance of the line is credited the distance, timed to the
 * last point, and given the kilometre split it fell short of: a marathon replayed to 41,990 m
 * still has its km 42, so its last stretch and its fastest kilometre are judged like any other.
 */
const onTheLineState = (replayed: RunState, courseM: number, elapsedMs: number): RunState => {
  const lastKm = Math.floor(courseM / 1000);
  const prev = replayed.splits[replayed.splits.length - 1];
  const missing = lastKm > 0 && (prev?.km ?? 0) < lastKm;
  const splits = missing ? [...replayed.splits, { km: lastKm, elapsedMs, splitMs: elapsedMs - (prev?.elapsedMs ?? 0) }] : replayed.splits;
  return { ...replayed, distanceM: courseM, elapsedMs, splits };
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

  const replayed = samples.reduce((s, sample) => applySample(s, sample), startRun(idleRun(course.distanceM), first.timestamp));
  const onTheLine = replayed.phase !== 'finished' && replayed.distanceM >= course.distanceM * (1 - UPLOAD_DISTANCE_TOLERANCE);
  if (replayed.phase !== 'finished' && !onTheLine) return { ok: false, reason: 'too_short', distanceM: replayed.distanceM };
  const state = onTheLine ? onTheLineState(replayed, course.distanceM, last.timestamp - first.timestamp) : replayed;
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
