import { z } from 'zod';
import { EntrantSchema, OrganizerSchema } from '@sivoov/shared';
import type { CsvEntrant, Entrant, Organizer } from '@sivoov/shared';
import { entrantFromRow } from './rows';
import { rankedRun } from './ranked';

const OrganizerRowSchema = z.object({ id: z.string(), race_id: z.string(), email: z.string() });
export const organizerFromRow = (row: unknown): Organizer => {
  const r = OrganizerRowSchema.parse(row);
  return OrganizerSchema.parse({ id: r.id, raceId: r.race_id, email: r.email });
};

export type EntrantWithBest = { entrant: Entrant; bestMs: number | null };
export type CourseCount = { distanceKey: string; entrants: number; finishers: number };
export type ResultRow = {
  bib: string; firstName: string; lastName: string; distanceKey: string;
  elapsedMs: number | null; distanceM: number | null; status: string | null; finishedAt: string | null;
};
export type ImportReport = { inserted: number; updated: number };

/** Organizer admin reads and writes. Kept apart from `db()` so the entrant-facing queries stay small. */
export const orgDb = (d1: D1Database) => ({
  async organizerByEmail(raceId: string, email: string): Promise<Organizer | null> {
    const row = await d1.prepare('SELECT * FROM organizers WHERE race_id = ? AND email = ?').bind(raceId, email.trim().toLowerCase()).first();
    return row ? organizerFromRow(row) : null;
  },
  async upsertOrganizer(organizer: Organizer): Promise<void> {
    await d1.prepare('INSERT INTO organizers (id, race_id, email) VALUES (?, ?, ?) ON CONFLICT(race_id, email) DO NOTHING').bind(organizer.id, organizer.raceId, organizer.email).run();
  },

  async createCode(id: string, organizerId: string, codeHash: string, expiresAt: string): Promise<void> {
    await d1.batch([
      d1.prepare('UPDATE organizer_codes SET consumed_at = ? WHERE organizer_id = ? AND consumed_at IS NULL').bind(new Date().toISOString(), organizerId),
      d1.prepare('INSERT INTO organizer_codes (id, organizer_id, code_hash, expires_at) VALUES (?, ?, ?, ?)').bind(id, organizerId, codeHash, expiresAt),
    ]);
  },
  async activeCode(organizerId: string): Promise<{ id: string; code_hash: string; expires_at: string; attempts: number } | null> {
    return d1
      .prepare('SELECT id, code_hash, expires_at, attempts FROM organizer_codes WHERE organizer_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1')
      .bind(organizerId)
      .first();
  },
  async codesRequestedSince(organizerId: string, sinceIso: string): Promise<number> {
    const row = await d1.prepare('SELECT COUNT(*) AS n FROM organizer_codes WHERE organizer_id = ? AND created_at > ?').bind(organizerId, sinceIso).first<{ n: number }>();
    return row?.n ?? 0;
  },
  async bumpAttempts(codeId: string): Promise<void> {
    await d1.prepare('UPDATE organizer_codes SET attempts = attempts + 1 WHERE id = ?').bind(codeId).run();
  },
  async consumeCode(codeId: string): Promise<void> {
    await d1.prepare('UPDATE organizer_codes SET consumed_at = ? WHERE id = ?').bind(new Date().toISOString(), codeId).run();
  },
  async createSession(id: string, organizerId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await d1.prepare('INSERT INTO organizer_sessions (id, organizer_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').bind(id, organizerId, tokenHash, expiresAt).run();
  },
  async organizerForToken(tokenHash: string): Promise<Organizer | null> {
    const row = await d1
      .prepare('SELECT o.* FROM organizer_sessions s JOIN organizers o ON o.id = s.organizer_id WHERE s.token_hash = ? AND s.expires_at > ?')
      .bind(tokenHash, new Date().toISOString())
      .first();
    return row ? organizerFromRow(row) : null;
  },
  async deleteSession(tokenHash: string): Promise<void> {
    await d1.prepare('DELETE FROM organizer_sessions WHERE token_hash = ?').bind(tokenHash).run();
  },

  /** Entrants and finishers per distance, in course order (longest first). */
  async courseCounts(raceId: string): Promise<CourseCount[]> {
    const { results } = await d1
      .prepare(
        `SELECT c.distance_key AS distance_key,
                (SELECT COUNT(*) FROM entrants e WHERE e.race_id = c.race_id AND e.distance_key = c.distance_key) AS entrants,
                (SELECT COUNT(DISTINCT r.entrant_id) FROM runs r JOIN entrants e ON e.id = r.entrant_id
                  WHERE e.race_id = c.race_id AND e.distance_key = c.distance_key AND ${rankedRun('r', 'e.race_id')}) AS finishers
         FROM courses c WHERE c.race_id = ? ORDER BY c.distance_m DESC`,
      )
      .bind(raceId)
      .all<{ distance_key: string; entrants: number; finishers: number }>();
    return results.map((r) => ({ distanceKey: r.distance_key, entrants: r.entrants, finishers: r.finishers }));
  },

  /** The entrant list with each runner's best official time; optional search on bib or name. */
  async entrantsWithBest(raceId: string, search = ''): Promise<EntrantWithBest[]> {
    const needle = `%${search.trim().toLowerCase()}%`;
    const { results } = await d1
      .prepare(
        `SELECT e.*, (SELECT MIN(r.elapsed_ms) FROM runs r WHERE r.entrant_id = e.id AND ${rankedRun('r', 'e.race_id')}) AS best_ms
         FROM entrants e
         WHERE e.race_id = ? AND (? = '%%' OR e.bib LIKE ? OR LOWER(e.first_name || ' ' || e.last_name) LIKE ? OR LOWER(e.last_name || ' ' || e.first_name) LIKE ?)
         ORDER BY CAST(e.bib AS INTEGER), e.bib`,
      )
      .bind(raceId, needle, needle, needle, needle)
      .all<Record<string, unknown> & { best_ms: number | null }>();
    return results.map((row) => ({ entrant: entrantFromRow(row), bestMs: row.best_ms }));
  },

  /**
   * One line per entrant: the best ranked run when there is one, else the latest run, else
   * nothing. A finish outside the race window (a rehearsal, a late run) is reported as
   * `outside_window`, never as `finished`: this file decides who gets a medal.
   */
  async resultRows(raceId: string): Promise<ResultRow[]> {
    const { results } = await d1
      .prepare(
        `SELECT e.bib, e.first_name, e.last_name, e.distance_key, r.elapsed_ms, r.distance_m, r.finished_at,
                CASE WHEN r.status IN ('finished', 'uploaded') AND NOT ${rankedRun('r', '?1')} THEN 'outside_window' ELSE r.status END AS status
         FROM entrants e LEFT JOIN runs r ON r.id = (
           SELECT r2.id FROM runs r2 WHERE r2.entrant_id = e.id
           ORDER BY CASE WHEN ${rankedRun('r2', '?1')} THEN 0 ELSE 1 END, r2.elapsed_ms ASC, r2.created_at DESC LIMIT 1)
         WHERE e.race_id = ?1 ORDER BY CAST(e.bib AS INTEGER), e.bib`,
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

export type OrgDb = ReturnType<typeof orgDb>;
