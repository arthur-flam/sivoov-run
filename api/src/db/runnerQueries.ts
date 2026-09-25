import { EntrantSchema } from '@sivoov/shared';
import type { CsvEntrant, Entrant } from '@sivoov/shared';
import { entrantFromRow } from './rows';
import { COUNTS_AS_FINISH } from './dashboardQueries';

export type EntrantWithBest = { entrant: Entrant; bestMs: number | null };
export type ResultRow = {
  bib: string; firstName: string; lastName: string; distanceKey: string;
  elapsedMs: number | null; distanceM: number | null; status: string | null; finishedAt: string | null;
};
export type ImportReport = { inserted: number; updated: number };

/** The organizer's reads and writes on runners. Kept apart from `db()` so the runner-facing queries stay small. */
export const runnerDb = (d1: D1Database) => ({
  /** The runner list with each runner's best official time; optional search on bib or name. */
  async entrantsWithBest(raceId: string, search = ''): Promise<EntrantWithBest[]> {
    const needle = `%${search.trim().toLowerCase()}%`;
    const { results } = await d1
      .prepare(
        `SELECT e.*, (SELECT MIN(r.elapsed_ms) FROM runs r WHERE r.entrant_id = e.id AND ${COUNTS_AS_FINISH}) AS best_ms
         FROM entrants e
         WHERE e.race_id = ? AND (? = '%%' OR e.bib LIKE ? OR LOWER(e.first_name || ' ' || e.last_name) LIKE ? OR LOWER(e.last_name || ' ' || e.first_name) LIKE ? OR e.email LIKE ?)
         ORDER BY CAST(e.bib AS INTEGER), e.bib`,
      )
      .bind(raceId, needle, needle, needle, needle, needle)
      .all<Record<string, unknown> & { best_ms: number | null }>();
    return results.map((row) => ({ entrant: entrantFromRow(row), bestMs: row.best_ms }));
  },

  /** One line per runner: the best finished run when there is one, else the latest run, else nothing. */
  async resultRows(raceId: string): Promise<ResultRow[]> {
    const { results } = await d1
      .prepare(
        `SELECT e.bib, e.first_name, e.last_name, e.distance_key, r.elapsed_ms, r.distance_m,
                CASE WHEN r.excluded_at IS NOT NULL THEN 'excluded' ELSE r.status END AS status, r.finished_at
         FROM entrants e LEFT JOIN runs r ON r.id = (
           SELECT r.id FROM runs r WHERE r.entrant_id = e.id
           ORDER BY CASE WHEN ${COUNTS_AS_FINISH} THEN 0 ELSE 1 END, r.elapsed_ms ASC, r.created_at DESC LIMIT 1)
         WHERE e.race_id = ? ORDER BY CAST(e.bib AS INTEGER), e.bib`,
      )
      .bind(raceId)
      .all<{ bib: string; first_name: string; last_name: string; distance_key: string; elapsed_ms: number | null; distance_m: number | null; status: string | null; finished_at: string | null }>();
    return results.map((r) => ({
      bib: r.bib, firstName: r.first_name, lastName: r.last_name, distanceKey: r.distance_key,
      elapsedMs: r.elapsed_ms, distanceM: r.distance_m, status: r.status, finishedAt: r.finished_at,
    }));
  },

  /** Idempotent on (race, bib): existing bibs are updated in place and keep their id, new ones are inserted. */
  async importEntrants(raceId: string, rows: CsvEntrant[]): Promise<ImportReport> {
    if (rows.length === 0) return { inserted: 0, updated: 0 };
    const { results } = await d1.prepare('SELECT bib FROM entrants WHERE race_id = ?').bind(raceId).all<{ bib: string }>();
    const existing = new Set(results.map((r) => r.bib));
    const entrants = rows.map((r) => EntrantSchema.parse({ ...r, id: `${raceId}-${r.bib}`, raceId, source: 'import' }));
    const statements = entrants.map((e) =>
      d1
        .prepare(
          `INSERT INTO entrants (id, race_id, bib, email, first_name, last_name, distance_key, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(race_id, bib) DO UPDATE SET email=excluded.email, first_name=excluded.first_name, last_name=excluded.last_name, distance_key=excluded.distance_key`,
        )
        .bind(e.id, e.raceId, e.bib, e.email, e.firstName, e.lastName, e.distanceKey, e.source),
    );
    // D1 batches are transactional; chunks keep each batch under the statement limit.
    const chunks = Array.from({ length: Math.ceil(statements.length / 100) }, (_, i) => statements.slice(i * 100, (i + 1) * 100));
    await chunks.reduce((p, chunk) => p.then(() => d1.batch(chunk).then(() => undefined)), Promise.resolve());
    const updated = entrants.filter((e) => existing.has(e.bib)).length;
    return { inserted: entrants.length - updated, updated };
  },
});

export type RunnerDb = ReturnType<typeof runnerDb>;
