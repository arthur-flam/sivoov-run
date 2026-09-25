/**
 * SQL for a run the results count: finished (or uploaded) and started inside its race's
 * window. The same rule as `isRanked` in shared, for queries that cannot call it row by row,
 * so the public results, the organizer's counts and the medal export never disagree.
 * `raceId` is an SQL expression (`e.race_id`, or a bound `?1`); the window is looked up rather
 * than joined, because SQLite cannot see an outer alias from the ORDER BY of a subquery that
 * sits in a JOIN's ON clause (resultRows), and a bound id sidesteps that too.
 * julianday reads both the app's `Z` timestamps and the offsets the window is written with.
 */
export const rankedRun = (run: string, raceId: string): string =>
  `(${run}.status IN ('finished', 'uploaded') AND julianday(${run}.started_at) BETWEEN ` +
  `julianday((SELECT window_start FROM races WHERE id = ${raceId})) AND julianday((SELECT window_end FROM races WHERE id = ${raceId})))`;
