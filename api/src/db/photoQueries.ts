import { PhotoMomentSchema, RunnerPhotoSchema } from '@sivoov/shared';
import type { PhotoMoment, RunnerPhoto } from '@sivoov/shared';
import { courseRaceOf } from './courseRace';

/** Photo moments, runners' pictures and the app's web links (migration 0009). */

const momentFromRow = (row: Record<string, unknown>): PhotoMoment =>
  PhotoMomentSchema.parse({
    id: row.id,
    raceId: row.race_id,
    title: row.title,
    at: row.at,
    ask: row.ask,
    scene: row.scene,
    refs: JSON.parse(String(row.refs ?? '[]')),
    sort: row.sort,
    createdAt: row.created_at,
  });

const photoFromRow = (row: Record<string, unknown>): RunnerPhoto =>
  RunnerPhotoSchema.parse({
    id: row.id,
    entrantId: row.entrant_id,
    momentId: row.moment_id,
    selfieKey: row.selfie_key,
    status: row.status,
    resultKey: row.result_key ?? undefined,
    error: row.error ?? undefined,
    attempts: row.attempts,
    shown: row.shown === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

export const photoQueries = (d1: D1Database) => ({
  /** A demo race plays the real race's moments (`demo_of`), like its courses. */
  async moments(raceId: string): Promise<PhotoMoment[]> {
    const { results } = await d1
      .prepare(`SELECT * FROM photo_moments WHERE race_id = ${courseRaceOf('?1')} ORDER BY sort, created_at`)
      .bind(raceId)
      .all<Record<string, unknown>>();
    return results.map(momentFromRow);
  },
  async moment(raceId: string, id: string): Promise<PhotoMoment | null> {
    const row = await d1
      .prepare(`SELECT * FROM photo_moments WHERE race_id = ${courseRaceOf('?1')} AND id = ?2`)
      .bind(raceId, id)
      .first<Record<string, unknown>>();
    return row ? momentFromRow(row) : null;
  },
  async upsertMoment(m: PhotoMoment): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO photo_moments (id, race_id, title, at, ask, scene, refs, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, at = excluded.at, ask = excluded.ask, scene = excluded.scene, refs = excluded.refs, sort = excluded.sort`,
      )
      .bind(m.id, m.raceId, m.title, m.at, m.ask, m.scene, JSON.stringify(m.refs), m.sort, m.createdAt)
      .run();
  },
  /** The moment and every runner's photo for it. Returns the R2 keys to erase (selfies and pictures). */
  async deleteMoment(raceId: string, id: string): Promise<string[]> {
    // Only a moment of this race: another race's moment id deletes nothing.
    const ofRace = 'moment_id IN (SELECT id FROM photo_moments WHERE race_id = ?1 AND id = ?2)';
    const { results } = await d1.prepare(`SELECT selfie_key, result_key FROM runner_photos WHERE ${ofRace}`).bind(raceId, id).all<{ selfie_key: string; result_key: string | null }>();
    await d1.batch([d1.prepare(`DELETE FROM runner_photos WHERE ${ofRace}`).bind(raceId, id), d1.prepare('DELETE FROM photo_moments WHERE race_id = ?1 AND id = ?2').bind(raceId, id)]);
    return results.flatMap((r) => [r.selfie_key, ...(r.result_key ? [r.result_key] : [])]);
  },
  /** How many runners' pictures each moment has made. */
  async doneByMoment(raceId: string): Promise<Map<string, number>> {
    const { results } = await d1
      .prepare(`SELECT p.moment_id AS id, COUNT(*) AS n FROM runner_photos p JOIN entrants e ON e.id = p.entrant_id WHERE e.race_id = ? AND p.status = 'done' GROUP BY p.moment_id`)
      .bind(raceId)
      .all<{ id: string; n: number }>();
    return new Map(results.map((r) => [r.id, r.n]));
  },

  async photos(entrantId: string): Promise<RunnerPhoto[]> {
    const { results } = await d1.prepare('SELECT * FROM runner_photos WHERE entrant_id = ? ORDER BY created_at').bind(entrantId).all<Record<string, unknown>>();
    return results.map(photoFromRow);
  },
  async photo(entrantId: string, id: string): Promise<RunnerPhoto | null> {
    const row = await d1.prepare('SELECT * FROM runner_photos WHERE entrant_id = ? AND id = ?').bind(entrantId, id).first<Record<string, unknown>>();
    return row ? photoFromRow(row) : null;
  },
  async photoById(id: string): Promise<RunnerPhoto | null> {
    const row = await d1.prepare('SELECT * FROM runner_photos WHERE id = ?').bind(id).first<Record<string, unknown>>();
    return row ? photoFromRow(row) : null;
  },
  async upsertPhoto(p: RunnerPhoto): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO runner_photos (id, entrant_id, moment_id, selfie_key, status, result_key, error, attempts, shown, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(entrant_id, moment_id) DO UPDATE SET selfie_key = excluded.selfie_key, status = excluded.status, result_key = excluded.result_key,
           error = excluded.error, attempts = excluded.attempts, shown = excluded.shown, updated_at = excluded.updated_at`,
      )
      .bind(p.id, p.entrantId, p.momentId, p.selfieKey, p.status, p.resultKey ?? null, p.error ?? null, p.attempts, p.shown ? 1 : 0, p.createdAt, p.updatedAt)
      .run();
  },
  /**
   * Marks a picture as being made, only if it is not already (or was lost): two taps, two tabs,
   * never two paid renders. Returns false when another request holds it.
   */
  async claimRender(id: string, nowIso: string, staleBeforeIso: string): Promise<boolean> {
    const res = await d1
      .prepare(`UPDATE runner_photos SET status = 'rendering', attempts = attempts + 1, updated_at = ?1 WHERE id = ?2 AND (status != 'rendering' OR updated_at < ?3)`)
      .bind(nowIso, id, staleBeforeIso)
      .run();
    return (res.meta.changes ?? 0) > 0;
  },
  /**
   * The end of a render: written only if the photo is still being made, so a photo deleted (or
   * a runner's data erased) meanwhile stays gone. False when it was.
   */
  async finishRender(p: RunnerPhoto): Promise<boolean> {
    const res = await d1
      .prepare(`UPDATE runner_photos SET status = ?1, result_key = ?2, error = ?3, attempts = ?4, updated_at = ?5 WHERE id = ?6 AND status = 'rendering'`)
      .bind(p.status, p.resultKey ?? null, p.error ?? null, p.attempts, p.updatedAt, p.id)
      .run();
    return (res.meta.changes ?? 0) > 0;
  },
  /**
   * Takes one of today's pictures for the runner (migration 0010), in one statement so two
   * requests at once cannot both take the last one. False when today's are all made.
   */
  async spendRender(entrantId: string, day: string, perDay: number): Promise<boolean> {
    const res = await d1
      .prepare(
        `UPDATE entrants SET photo_renders = CASE WHEN photo_day = ?2 THEN photo_renders + 1 ELSE 1 END, photo_day = ?2
         WHERE id = ?1 AND (photo_day IS NOT ?2 OR photo_renders < ?3)`,
      )
      .bind(entrantId, day, perDay)
      .run();
    return (res.meta.changes ?? 0) > 0;
  },
  /** Gives back a picture taken for a render that did not start (another request was making it). */
  async refundRender(entrantId: string, day: string): Promise<void> {
    await d1.prepare('UPDATE entrants SET photo_renders = photo_renders - 1 WHERE id = ? AND photo_day = ? AND photo_renders > 0').bind(entrantId, day).run();
  },
  async deletePhoto(entrantId: string, id: string): Promise<void> {
    await d1.prepare('DELETE FROM runner_photos WHERE entrant_id = ? AND id = ?').bind(entrantId, id).run();
  },
  /** Every picture of a runner, for « Supprimer mes données ». Returns the R2 keys to erase. */
  async forgetPhotos(entrantId: string): Promise<string[]> {
    const { results } = await d1.prepare('SELECT * FROM runner_photos WHERE entrant_id = ?').bind(entrantId).all<Record<string, unknown>>();
    await d1.batch([d1.prepare('DELETE FROM runner_photos WHERE entrant_id = ?').bind(entrantId), d1.prepare('DELETE FROM web_links WHERE entrant_id = ?').bind(entrantId)]);
    return results.map(photoFromRow).flatMap((p) => [p.selfieKey, ...(p.resultKey ? [p.resultKey] : [])]);
  },

  async createWebLink(codeHash: string, entrantId: string, expiresAt: string): Promise<void> {
    await d1.prepare('INSERT INTO web_links (code_hash, entrant_id, expires_at) VALUES (?, ?, ?)').bind(codeHash, entrantId, expiresAt).run();
  },
  /** Uses a web link once: the entrant it opens, or null when unknown, used or out of date. */
  async useWebLink(codeHash: string, nowIso: string): Promise<string | null> {
    const row = await d1
      .prepare('UPDATE web_links SET used_at = ?1 WHERE code_hash = ?2 AND used_at IS NULL AND expires_at > ?1 RETURNING entrant_id')
      .bind(nowIso, codeHash)
      .first<{ entrant_id: string }>();
    return row?.entrant_id ?? null;
  },
});
