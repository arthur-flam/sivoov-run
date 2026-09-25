/**
 * SQL for a run the results count: finished (or uploaded), started inside its race's window,
 * on the entrant's own distance. The same rule as `isRanked` in shared, for queries that cannot call it row by row,
 * so the public results, the organizer's counts and the medal export never disagree.
 * `raceId` is an SQL expression (`e.race_id`, or a bound `?1`); the window is looked up rather
 * than joined, because SQLite cannot see an outer alias from the ORDER BY of a subquery that
 * sits in a JOIN's ON clause (resultRows), and a bound id sidesteps that too.
 * julianday reads both the app's `Z` timestamps and the offsets the window is written with.
 */
export const rankedRun = (run: string, raceId: string): string =>
  `(${run}.status IN ('finished', 'uploaded') AND ${run}.started_at IS NOT NULL AND julianday(${run}.started_at) BETWEEN ` +
  `julianday((SELECT window_start FROM races WHERE id = ${raceId})) AND julianday((SELECT window_end FROM races WHERE id = ${raceId})) ` +
  // A run on another distance than the entrant's own (moved by a re-import) never counts.
  `AND (SELECT distance_key FROM courses WHERE id = ${run}.course_id) = (SELECT distance_key FROM entrants WHERE id = ${run}.entrant_id))`;
