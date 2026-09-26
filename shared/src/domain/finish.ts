import type { Race } from '../schemas/race';
import type { Run } from '../schemas/run';
import { officialStatus } from './official';
import { isRanked, windowPhase } from './raceWindow';

/**
 * What the finish line says to the runner, decided on the phone before any network:
 * - official: the whole distance, inside the race window; the server will rank it.
 * - rehearsal: the whole distance, before the window opens. The same experience, no ranking.
 * - closed: the whole distance, after the window closed.
 * - incomplete: stopped short of the distance. Never ranked, whatever the date.
 */
export type FinishOutcome = 'official' | 'rehearsal' | 'closed' | 'incomplete';

type Input = {
  distanceM: number;
  courseDistanceM: number;
  startedAtMs: number;
  /** The race window to hold the start against; null previews race day (the simulation). */
  window: Pick<Race, 'windowStart' | 'windowEnd'> | null;
};

export const finishOutcome = ({ distanceM, courseDistanceM, startedAtMs, window }: Input): FinishOutcome => {
  if (distanceM < courseDistanceM) return 'incomplete';
  if (!window) return 'official';
  const phase = windowPhase(window, startedAtMs);
  return phase === 'before' ? 'rehearsal' : phase === 'after' ? 'closed' : 'official';
};

/** Seconds per kilometre over the whole run; null before the first metre. */
export const averagePace = (elapsedMs: number, distanceM: number): number | null =>
  distanceM > 0 ? elapsedMs / distanceM : null;

/**
 * The runner's best official run among everything the phone knows: the runs the server
 * returned and the ones still waiting to upload, judged by the same rules the server applies.
 * The home screen shows the finish before the upload has gone through.
 */
export const bestRankedRun = (race: Pick<Race, 'windowStart' | 'windowEnd'>, courseDistanceM: number, runs: Run[]): Run | null =>
  runs
    .map((run) => ({ ...run, status: officialStatus(run, courseDistanceM) }))
    .filter((run) => isRanked(race, run))
    .reduce<Run | null>((best, run) => (best === null || run.elapsedMs < best.elapsedMs ? run : best), null);
