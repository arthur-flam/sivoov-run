/**
 * The numbers on the organizer's home page. Simulated runs never count as a start, and a time
 * an organizer set aside never counts as a finish.
 */
import { rankedRun } from './ranked';

export type Funnel = { entrants: number; signedIn: number; onApp: number; started: number; finished: number };
export type DistanceCount = { courseId: string; distanceKey: string; entrants: number; finished: number; hasTrace: boolean; published: boolean };
export type RecentRun = {
  id: string; status: string; source: string; elapsedMs: number; distanceM: number; at: string; excluded: boolean;
  bib: string; firstName: string; lastName: string; distanceKey: string;
};
export type Setup = { members: number };

/**
 * A run that counts in the results, on the alias `r`: finished for real, not set aside, inside
 * the race window, on the entrant's own distance (`rankedRun`, the one rule everywhere).
 */
export const COUNTS_AS_FINISH = rankedRun('r');

export const dashboardDb = (d1: D1Database) => ({
  async funnel(raceId: string): Promise<Funnel> {
    const row = await d1
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM entrants WHERE race_id = ?1) AS entrants,
           (SELECT COUNT(DISTINCT s.entrant_id) FROM sessions s JOIN entrants e ON e.id = s.entrant_id WHERE e.race_id = ?1) AS signed_in,
           (SELECT COUNT(DISTINCT s.entrant_id) FROM sessions s JOIN entrants e ON e.id = s.entrant_id WHERE e.race_id = ?1 AND s.client = 'app') AS on_app,
           (SELECT COUNT(DISTINCT r.entrant_id) FROM runs r JOIN entrants e ON e.id = r.entrant_id WHERE e.race_id = ?1 AND r.source != 'simulation') AS started,
           (SELECT COUNT(DISTINCT r.entrant_id) FROM runs r JOIN entrants e ON e.id = r.entrant_id WHERE e.race_id = ?1 AND ${COUNTS_AS_FINISH}) AS finished`,
      )
      .bind(raceId)
      .first<{ entrants: number; signed_in: number; on_app: number; started: number; finished: number }>();
    return { entrants: row?.entrants ?? 0, signedIn: row?.signed_in ?? 0, onApp: row?.on_app ?? 0, started: row?.started ?? 0, finished: row?.finished ?? 0 };
  },

  /** Per distance, longest first: runners, finishers, and whether the course is ready (trace, published audio). */
  async distances(raceId: string): Promise<DistanceCount[]> {
    const { results } = await d1
      .prepare(
        `SELECT c.id AS course_id, c.distance_key, c.geometry_key,
                (SELECT COUNT(*) FROM entrants e WHERE e.race_id = c.race_id AND e.distance_key = c.distance_key) AS entrants,
                (SELECT COUNT(DISTINCT r.entrant_id) FROM runs r JOIN entrants e ON e.id = r.entrant_id
                  WHERE e.race_id = c.race_id AND e.distance_key = c.distance_key AND ${COUNTS_AS_FINISH}) AS finished,
                (SELECT COUNT(*) FROM audio_packs p WHERE p.course_id = c.id) AS packs
         FROM courses c WHERE c.race_id = ? ORDER BY c.distance_m DESC`,
      )
      .bind(raceId)
      .all<{ course_id: string; distance_key: string; geometry_key: string | null; entrants: number; finished: number; packs: number }>();
    return results.map((r) => ({
      courseId: r.course_id, distanceKey: r.distance_key, entrants: r.entrants, finished: r.finished,
      hasTrace: r.geometry_key !== null, published: r.packs > 0,
    }));
  },

  async recentRuns(raceId: string, limit = 8): Promise<RecentRun[]> {
    const { results } = await d1
      .prepare(
        `SELECT r.id, r.status, r.source, r.elapsed_ms, r.distance_m, r.excluded_at,
                COALESCE(r.finished_at, r.started_at, r.created_at) AS at, e.bib, e.first_name, e.last_name, c.distance_key
         FROM runs r JOIN entrants e ON e.id = r.entrant_id JOIN courses c ON c.id = r.course_id
         WHERE e.race_id = ? ORDER BY at DESC LIMIT ?`,
      )
      .bind(raceId, limit)
      .all<{ id: string; status: string; source: string; elapsed_ms: number; distance_m: number; excluded_at: string | null; at: string; bib: string; first_name: string; last_name: string; distance_key: string }>();
    return results.map((r) => ({
      id: r.id, status: r.status, source: r.source, elapsedMs: r.elapsed_ms, distanceM: r.distance_m, at: r.at, excluded: r.excluded_at !== null,
      bib: r.bib, firstName: r.first_name, lastName: r.last_name, distanceKey: r.distance_key,
    }));
  },

  async setup(raceId: string): Promise<Setup> {
    const row = await d1.prepare('SELECT COUNT(*) AS n FROM organizers WHERE race_id = ?').bind(raceId).first<{ n: number }>();
    return { members: row?.n ?? 0 };
  },
});
