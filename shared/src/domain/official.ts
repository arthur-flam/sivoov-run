import type { Course } from '../schemas/course';
import type { DistanceKey } from '../schemas/race';
import type { Run, RunStatus } from '../schemas/run';

/**
 * Nobody has covered these distances faster. The men's road world records in September 2026
 * are 1:59:30 (marathon), 56:51 (half), 26:31 (10 km) and 12:49 (5 km); each is rounded down
 * to the minute, so the next record never makes a champion look like a bicycle.
 */
export const RECORD_FLOOR_MS: Record<DistanceKey, number> = {
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
export const FASTEST_KILOMETRE_MS = 130_000;

/** A clock may drift a little between the phone's start and finish stamps and its own count. */
const CLOCK_SLACK_MS = 60_000;

/**
 * What the results table may trust from an uploaded run. The app says 'finished'; the server
 * keeps that word only for a real run that covered the course distance in a time a runner can
 * run: no faster than the world record, no kilometre faster than a runner holds, and no more
 * time than passed between its start and its finish. Anything else is stored as 'abandoned':
 * it stays in the runner's history, never in the results.
 */
export const officialStatus = (
  run: Pick<Run, 'status' | 'source' | 'distanceM' | 'elapsedMs' | 'splits' | 'startedAt' | 'finishedAt'>,
  course: Pick<Course, 'distanceM' | 'distanceKey'>,
): RunStatus => {
  if (run.status !== 'finished' && run.status !== 'uploaded') return run.status;
  return run.source !== 'simulation' && run.distanceM >= course.distanceM && plausible(run, course.distanceKey) ? run.status : 'abandoned';
};

const plausible = (run: Pick<Run, 'elapsedMs' | 'splits' | 'startedAt' | 'finishedAt'>, key: DistanceKey): boolean => {
  const wallMs = run.startedAt && run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : null;
  return (
    run.elapsedMs >= RECORD_FLOOR_MS[key] &&
    run.splits.every((s) => s.splitMs >= FASTEST_KILOMETRE_MS) &&
    (wallMs === null || run.elapsedMs <= wallMs + CLOCK_SLACK_MS)
  );
};
