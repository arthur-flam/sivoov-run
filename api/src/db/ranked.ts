/**
 * SQL for a run the results count: finished (or uploaded), not set aside by the organizer,
 * started inside its race's window, on the entrant's own distance. The same rule as `isRanked`
 * in shared, for queries that cannot call it row by row, so the public results, the admin's
 * counts, the runner list and the medal export never disagree.
 *
 * Only the run's own alias appears: the race and the entrant are looked up from the run, never
 * joined, because SQLite cannot see an outer alias from the ORDER BY of a subquery that sits in
 * a JOIN's ON clause, which is where the runner export uses it. julianday reads both the app's
 * `Z` timestamps and the offsets the window is written with.
 */
export const rankedRun = (run: string): string => {
  const race = `(SELECT race_id FROM entrants WHERE id = ${run}.entrant_id)`;
  return (
    `(${run}.status IN ('finished', 'uploaded') AND ${run}.excluded_at IS NULL AND ${run}.started_at IS NOT NULL ` +
    `AND julianday(${run}.started_at) BETWEEN julianday((SELECT window_start FROM races WHERE id = ${race})) ` +
    `AND julianday((SELECT window_end FROM races WHERE id = ${race})) ` +
    `AND (SELECT distance_key FROM courses WHERE id = ${run}.course_id) = (SELECT distance_key FROM entrants WHERE id = ${run}.entrant_id))`
  );
};
