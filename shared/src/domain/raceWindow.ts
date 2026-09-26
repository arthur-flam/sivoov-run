import type { Race } from '../schemas/race';
import type { Run } from '../schemas/run';

type RaceWindow = Pick<Race, 'windowStart' | 'windowEnd'>;

/** Where a moment sits against the race's virtual window: a run only counts inside it. */
export type WindowPhase = 'before' | 'open' | 'after';

export const windowPhase = (race: RaceWindow, atMs: number): WindowPhase =>
  atMs < Date.parse(race.windowStart) ? 'before' : atMs > Date.parse(race.windowEnd) ? 'after' : 'open';

/** A run started outside the window is a rehearsal (or a late one): stored, never ranked. */
export const startedInWindow = (race: RaceWindow, startedAt: string | undefined): boolean =>
  startedAt !== undefined && windowPhase(race, Date.parse(startedAt)) === 'open';

/** What the results list, the result page and the app agree to call an official finish. */
export const isRanked = (race: RaceWindow, run: Pick<Run, 'status' | 'startedAt'>): boolean =>
  (run.status === 'finished' || run.status === 'uploaded') && startedInWindow(race, run.startedAt);

/** Whole days until the window opens, rounded up; 0 once it is open or over. */
export const daysUntilWindow = (race: RaceWindow, nowMs: number): number =>
  Math.max(0, Math.ceil((Date.parse(race.windowStart) - nowMs) / 86_400_000));
