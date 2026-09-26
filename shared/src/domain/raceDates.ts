import type { Race } from '../schemas/race';

export type RaceDateProblem = 'dateEnd' | 'windowEnd';

/**
 * The fields of a race whose dates are out of order: the physical race ending before it starts
 * (a one-day race ends the day it starts), or the virtual window closing before it opens.
 */
export const raceDateProblems = (race: Pick<Race, 'dateStart' | 'dateEnd' | 'windowStart' | 'windowEnd'>): RaceDateProblem[] => [
  ...(race.dateEnd < race.dateStart ? (['dateEnd'] as const) : []),
  ...(Date.parse(race.windowEnd) <= Date.parse(race.windowStart) ? (['windowEnd'] as const) : []),
];
