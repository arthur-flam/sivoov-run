import type { AudioPack, Course, Entrant, Race, Run } from '@sivoov/shared';
import { audioPackFromRow, courseFromRow, entrantFromRow, raceFromRow, runFromRow } from './rows';

/** Typed D1 access. Every read goes through a row schema; every write takes a domain object. */
export const db = (d1: D1Database) => ({
  async raceBySlug(slug: string): Promise<Race | null> {
    const row = await d1.prepare('SELECT * FROM races WHERE slug = ?').bind(slug).first();
    return row ? raceFromRow(row) : null;
  },
  async raceById(id: string): Promise<Race | null> {
    const row = await d1.prepare('SELECT * FROM races WHERE id = ?').bind(id).first();
    return row ? raceFromRow(row) : null;
  },
  async races(): Promise<Race[]> {
    const { results } = await d1.prepare("SELECT * FROM races WHERE status != 'draft' ORDER BY date_start").all();
    return results.map(raceFromRow);
  },
  async upsertRace(race: Race): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO races (id, slug, name, city, country, date_start, date_end, window_start, window_end, timezone, organizer_url, theme, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, name=excluded.name, city=excluded.city, country=excluded.country,
           date_start=excluded.date_start, date_end=excluded.date_end, window_start=excluded.window_start, window_end=excluded.window_end,
           timezone=excluded.timezone, organizer_url=excluded.organizer_url, theme=excluded.theme, status=excluded.status`,
      )
      .bind(race.id, race.slug, race.name, race.city, race.country, race.dateStart, race.dateEnd, race.windowStart, race.windowEnd,
        race.timezone, race.organizerUrl ?? null, JSON.stringify(race.theme), race.status)
      .run();
  },

  async coursesForRace(raceId: string): Promise<Course[]> {
    const { results } = await d1.prepare('SELECT * FROM courses WHERE race_id = ? ORDER BY distance_m DESC').bind(raceId).all();
    return results.map(courseFromRow);
  },
  async courseById(id: string): Promise<Course | null> {
    const row = await d1.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first();
    return row ? courseFromRow(row) : null;
  },
  async courseFor(raceId: string, distanceKey: string): Promise<Course | null> {
    const row = await d1.prepare('SELECT * FROM courses WHERE race_id = ? AND distance_key = ?').bind(raceId, distanceKey).first();
    return row ? courseFromRow(row) : null;
  },
  async upsertCourse(course: Course): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO courses (id, race_id, distance_key, distance_m, geometry_key, landmarks) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET distance_m=excluded.distance_m, geometry_key=excluded.geometry_key, landmarks=excluded.landmarks`,
      )
      .bind(course.id, course.raceId, course.distanceKey, course.distanceM, course.geometryKey ?? null, JSON.stringify(course.landmarks))
      .run();
  },

  /** After a GPX upload: the geometry object is written first, then the course points at it. */
  async setGeometryKey(courseId: string, geometryKey: string): Promise<void> {
    await d1.prepare('UPDATE courses SET geometry_key = ? WHERE id = ?').bind(geometryKey, courseId).run();
  },

  async entrantByBibEmail(raceId: string, bib: string, email: string): Promise<Entrant | null> {
    const row = await d1.prepare('SELECT * FROM entrants WHERE race_id = ? AND bib = ? AND email = ?').bind(raceId, bib, email).first();
    return row ? entrantFromRow(row) : null;
  },
  async entrantById(id: string): Promise<Entrant | null> {
    const row = await d1.prepare('SELECT * FROM entrants WHERE id = ?').bind(id).first();
    return row ? entrantFromRow(row) : null;
  },
  async entrantsForRace(raceId: string): Promise<Entrant[]> {
    const { results } = await d1.prepare('SELECT * FROM entrants WHERE race_id = ? ORDER BY CAST(bib AS INTEGER), bib').bind(raceId).all();
    return results.map(entrantFromRow);
  },
  /** Idempotent on (race, bib): re-importing the organizer's CSV updates in place. */
  async upsertEntrant(entrant: Entrant): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO entrants (id, race_id, bib, email, first_name, last_name, distance_key, address, source, slot_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(race_id, bib) DO UPDATE SET email=excluded.email, first_name=excluded.first_name, last_name=excluded.last_name,
           distance_key=excluded.distance_key, address=COALESCE(excluded.address, entrants.address), source=excluded.source`,
      )
      .bind(entrant.id, entrant.raceId, entrant.bib, entrant.email, entrant.firstName, entrant.lastName, entrant.distanceKey,
        entrant.address ? JSON.stringify(entrant.address) : null, entrant.source, entrant.slotAt ?? null)
      .run();
  },
  async setSlot(entrantId: string, slotAt: string | null): Promise<void> {
    await d1.prepare('UPDATE entrants SET slot_at = ? WHERE id = ?').bind(slotAt, entrantId).run();
  },

  async createCode(id: string, entrantId: string, codeHash: string, expiresAt: string): Promise<void> {
    await d1.batch([
      d1.prepare('UPDATE auth_codes SET consumed_at = ? WHERE entrant_id = ? AND consumed_at IS NULL').bind(new Date().toISOString(), entrantId),
      d1.prepare('INSERT INTO auth_codes (id, entrant_id, code_hash, expires_at) VALUES (?, ?, ?, ?)').bind(id, entrantId, codeHash, expiresAt),
    ]);
  },
  async activeCode(entrantId: string): Promise<{ id: string; code_hash: string; expires_at: string; attempts: number } | null> {
    return d1
      .prepare('SELECT id, code_hash, expires_at, attempts FROM auth_codes WHERE entrant_id = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1')
      .bind(entrantId)
      .first();
  },
  async codesRequestedSince(entrantId: string, sinceIso: string): Promise<number> {
    const row = await d1.prepare('SELECT COUNT(*) AS n FROM auth_codes WHERE entrant_id = ? AND created_at > ?').bind(entrantId, sinceIso).first<{ n: number }>();
    return row?.n ?? 0;
  },
  async bumpAttempts(codeId: string): Promise<void> {
    await d1.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?').bind(codeId).run();
  },
  async consumeCode(codeId: string): Promise<void> {
    await d1.prepare('UPDATE auth_codes SET consumed_at = ? WHERE id = ?').bind(new Date().toISOString(), codeId).run();
  },

  async createSession(id: string, entrantId: string, tokenHash: string, expiresAt: string): Promise<void> {
    await d1.prepare('INSERT INTO sessions (id, entrant_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').bind(id, entrantId, tokenHash, expiresAt).run();
  },
  async entrantForToken(tokenHash: string): Promise<Entrant | null> {
    const row = await d1
      .prepare('SELECT e.* FROM sessions s JOIN entrants e ON e.id = s.entrant_id WHERE s.token_hash = ? AND s.expires_at > ?')
      .bind(tokenHash, new Date().toISOString())
      .first();
    return row ? entrantFromRow(row) : null;
  },
  async deleteSession(tokenHash: string): Promise<void> {
    await d1.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  },

  async upsertRun(run: Run, traceKey: string | null): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO runs (id, entrant_id, course_id, status, started_at, finished_at, elapsed_ms, distance_m, splits, source, device, trace_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, started_at=excluded.started_at, finished_at=excluded.finished_at,
           elapsed_ms=excluded.elapsed_ms, distance_m=excluded.distance_m, splits=excluded.splits, device=excluded.device,
           trace_key=COALESCE(excluded.trace_key, runs.trace_key)`,
      )
      .bind(run.id, run.entrantId, run.courseId, run.status, run.startedAt ?? null, run.finishedAt ?? null, run.elapsedMs, run.distanceM,
        JSON.stringify(run.splits), run.source, run.device ? JSON.stringify(run.device) : null, traceKey)
      .run();
  },
  async runsForEntrant(entrantId: string): Promise<Run[]> {
    const { results } = await d1.prepare('SELECT * FROM runs WHERE entrant_id = ? ORDER BY created_at DESC').bind(entrantId).all();
    return results.map(runFromRow);
  },
  async runById(id: string): Promise<Run | null> {
    const row = await d1.prepare('SELECT * FROM runs WHERE id = ?').bind(id).first();
    return row ? runFromRow(row) : null;
  },
  /** Official results: best finished run per entrant, by time. */
  async resultsForCourse(courseId: string): Promise<Array<{ run: Run; entrant: Entrant }>> {
    const { results } = await d1
      .prepare(
        `SELECT r.*, e.id AS e_id, e.race_id AS e_race_id, e.bib AS e_bib, e.email AS e_email, e.first_name AS e_first_name,
                e.last_name AS e_last_name, e.distance_key AS e_distance_key, e.address AS e_address, e.source AS e_source, e.slot_at AS e_slot_at
         FROM runs r JOIN entrants e ON e.id = r.entrant_id
         WHERE r.course_id = ? AND r.status IN ('finished', 'uploaded')
           AND r.elapsed_ms = (SELECT MIN(elapsed_ms) FROM runs r2 WHERE r2.entrant_id = r.entrant_id AND r2.course_id = r.course_id AND r2.status IN ('finished', 'uploaded'))
         ORDER BY r.elapsed_ms ASC`,
      )
      .bind(courseId)
      .all<Record<string, unknown>>();
    return results.map((row) => ({
      run: runFromRow(row),
      entrant: entrantFromRow({
        id: row.e_id, race_id: row.e_race_id, bib: row.e_bib, email: row.e_email, first_name: row.e_first_name, last_name: row.e_last_name,
        distance_key: row.e_distance_key, address: row.e_address, source: row.e_source, slot_at: row.e_slot_at,
      }),
    }));
  },
  /** The newest pack version for a course and locale; what the app downloads before a run. */
  async latestAudioPack(courseId: string, locale = 'fr'): Promise<AudioPack | null> {
    const row = await d1.prepare('SELECT * FROM audio_packs WHERE course_id = ? AND locale = ? ORDER BY version DESC LIMIT 1').bind(courseId, locale).first();
    return row ? audioPackFromRow(row) : null;
  },
  /** Idempotent on (course, version, locale): rebuilding a pack replaces its manifest. */
  async upsertAudioPack(pack: AudioPack): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO audio_packs (id, course_id, version, locale, manifest) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(course_id, version, locale) DO UPDATE SET manifest=excluded.manifest`,
      )
      .bind(`${pack.courseId}/${pack.version}/${pack.locale}`, pack.courseId, pack.version, pack.locale, JSON.stringify(pack))
      .run();
  },
});

export type Db = ReturnType<typeof db>;
