import { DeviceInfoSchema, DistanceKeySchema, EntrantSchema } from '@sivoov/shared';
import type { CsvEntrant, DeviceInfo, DistanceKey, Entrant } from '@sivoov/shared';
import { entrantFromRow } from './rows';
import { COUNTS_AS_FINISH } from './dashboardQueries';

/**
 * The organizer's reads and writes on runners, and the runner sessions the admin reports on.
 * "Connecté" is a runner with at least one session; "dans l'application" one opened by the app.
 */

export const RUNNER_FILTERS = ['all', 'not_signed_in', 'signed_in', 'app', 'ran', 'finished'] as const;
export type RunnerFilter = (typeof RUNNER_FILTERS)[number];
export type RunnerCounts = Record<RunnerFilter, number>;
export type RunnerQuery = { filter: RunnerFilter; distance: DistanceKey | null; search: string; page: number };
export const PAGE_SIZE = 100;

/** Where a runner stands with the app, from their sessions. */
export type Presence = { sessions: number; appSessions: number; lastSeenAt: string | null; device: DeviceInfo | null };
export type RunnerRow = { entrant: Entrant; bestMs: number | null; presence: Presence };
export type RunnerSession = { client: string | null; device: DeviceInfo | null; lastSeenAt: string; createdAt: string };
export type RunnerRun = {
  id: string; status: string; source: string; excluded: boolean; elapsedMs: number; distanceM: number;
  at: string; distanceKey: string;
};
export type RunnerDetail = { entrant: Entrant; createdAt: string; presence: Presence; sessions: RunnerSession[]; runs: RunnerRun[] };
export type MedalRow = { entrant: Entrant; bestMs: number };
export type ResultRow = {
  bib: string; firstName: string; lastName: string; distanceKey: string;
  elapsedMs: number | null; distanceM: number | null; status: string | null; finishedAt: string | null;
};
export type ImportReport = { inserted: number; updated: number };
export type EntrantSession = { id: string; entrant: Entrant; lastSeenAt: string | null; device: DeviceInfo | null };

/** A device column is written by the Worker from a header: read it back defensively. */
export const deviceFromJson = (json: string | null | undefined): DeviceInfo | null => {
  if (!json) return null;
  try {
    const parsed = DeviceInfoSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/**
 * Per runner of one race: their sessions (count, app count, last seen, the phone of the latest
 * app session) and their runs (started for real, best official time). Aggregated once per
 * race rather than per row: `sessions` has no index on the entrant.
 */
const WITH_PRESENCE = `
  WITH ses AS (
    SELECT s.entrant_id, COUNT(*) AS sessions, SUM(CASE WHEN s.client = 'app' THEN 1 ELSE 0 END) AS app_sessions,
           MAX(COALESCE(s.last_seen_at, s.created_at)) AS last_seen_at
    FROM sessions s JOIN entrants e ON e.id = s.entrant_id WHERE e.race_id = ?1 GROUP BY s.entrant_id
  ),
  dev AS (
    SELECT entrant_id, device FROM (
      SELECT s.entrant_id, s.device, ROW_NUMBER() OVER (PARTITION BY s.entrant_id ORDER BY COALESCE(s.last_seen_at, s.created_at) DESC) AS n
      FROM sessions s JOIN entrants e ON e.id = s.entrant_id WHERE e.race_id = ?1 AND s.client = 'app' AND s.device IS NOT NULL
    ) WHERE n = 1
  ),
  ran AS (
    SELECT r.entrant_id, SUM(CASE WHEN r.source != 'simulation' THEN 1 ELSE 0 END) AS started,
           MIN(CASE WHEN ${COUNTS_AS_FINISH} THEN r.elapsed_ms END) AS best_ms
    FROM runs r JOIN entrants e ON e.id = r.entrant_id WHERE e.race_id = ?1 GROUP BY r.entrant_id
  )`;

const FROM_RUNNERS = `
  FROM entrants e LEFT JOIN ses ON ses.entrant_id = e.id LEFT JOIN dev ON dev.entrant_id = e.id LEFT JOIN ran ON ran.entrant_id = e.id
  WHERE e.race_id = ?1 AND (?2 = '' OR e.distance_key = ?2)
    AND (?3 = '' OR e.bib LIKE ?3 ESCAPE '\\' OR LOWER(e.first_name || ' ' || e.last_name) LIKE ?3 ESCAPE '\\'
         OR LOWER(e.last_name || ' ' || e.first_name) LIKE ?3 ESCAPE '\\' OR LOWER(e.email) LIKE ?3 ESCAPE '\\')`;

/** Each chip of the list, as a condition on the joined row. */
const FILTER_SQL: Record<RunnerFilter, string> = {
  all: '1 = 1',
  not_signed_in: 'ses.entrant_id IS NULL',
  signed_in: 'ses.entrant_id IS NOT NULL',
  app: 'ses.app_sessions > 0',
  ran: 'ran.started > 0',
  finished: 'ran.best_ms IS NOT NULL',
};

const ORDER = 'ORDER BY CAST(e.bib AS INTEGER), e.bib';

/** "dur" -> "%dur%", with the LIKE wildcards someone might type taken literally. */
const likeNeedle = (search: string): string => {
  const s = search.trim().toLowerCase();
  return s === '' ? '' : `%${s.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
};

type PresenceRow = Record<string, unknown> & { best_ms: number | null; sessions: number | null; app_sessions: number | null; last_seen_at: string | null; device: string | null };

const runnerFromRow = (row: PresenceRow): RunnerRow => ({
  entrant: entrantFromRow(row),
  bestMs: row.best_ms,
  presence: { sessions: row.sessions ?? 0, appSessions: row.app_sessions ?? 0, lastSeenAt: row.last_seen_at, device: deviceFromJson(row.device) },
});

const SELECT_RUNNER = 'SELECT e.*, ran.best_ms, ses.sessions, ses.app_sessions, ses.last_seen_at, dev.device';

const chunk = <T>(items: readonly T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export const runnerDb = (d1: D1Database) => ({
  /** One page of the list and the count behind every chip, both under the same distance and search. */
  async list(raceId: string, q: RunnerQuery): Promise<{ rows: RunnerRow[]; counts: RunnerCounts }> {
    const [rows, counts] = await Promise.all([
      d1
        .prepare(`${WITH_PRESENCE} ${SELECT_RUNNER} ${FROM_RUNNERS} AND ${FILTER_SQL[q.filter]} ${ORDER} LIMIT ?4 OFFSET ?5`)
        .bind(raceId, q.distance ?? '', likeNeedle(q.search), PAGE_SIZE, Math.max(0, q.page - 1) * PAGE_SIZE)
        .all<PresenceRow>(),
      d1
        .prepare(`${WITH_PRESENCE} SELECT ${RUNNER_FILTERS.map((f) => `SUM(CASE WHEN ${FILTER_SQL[f]} THEN 1 ELSE 0 END) AS "${f}"`).join(', ')} ${FROM_RUNNERS}`)
        .bind(raceId, q.distance ?? '', likeNeedle(q.search))
        .first<Record<RunnerFilter, number | null>>(),
    ]);
    return {
      rows: rows.results.map(runnerFromRow),
      counts: Object.fromEntries(RUNNER_FILTERS.map((f) => [f, counts?.[f] ?? 0])) as RunnerCounts,
    };
  },

  /** Every runner matching the list's filters, for the download. */
  async all(raceId: string, q: Omit<RunnerQuery, 'page'>): Promise<RunnerRow[]> {
    const { results } = await d1
      .prepare(`${WITH_PRESENCE} ${SELECT_RUNNER} ${FROM_RUNNERS} AND ${FILTER_SQL[q.filter]} ${ORDER}`)
      .bind(raceId, q.distance ?? '', likeNeedle(q.search))
      .all<PresenceRow>();
    return results.map(runnerFromRow);
  },

  /** One runner with where they stand: sessions, runs, and when they were added. */
  async byBib(raceId: string, bib: string): Promise<RunnerDetail | null> {
    const row = await d1.prepare('SELECT * FROM entrants WHERE race_id = ? AND bib = ?').bind(raceId, bib).first<Record<string, unknown> & { created_at: string }>();
    if (!row) return null;
    const entrant = entrantFromRow(row);
    const [sessions, runs] = await Promise.all([
      d1
        .prepare('SELECT client, device, COALESCE(last_seen_at, created_at) AS last_seen_at, created_at FROM sessions WHERE entrant_id = ? ORDER BY last_seen_at DESC')
        .bind(entrant.id)
        .all<{ client: string | null; device: string | null; last_seen_at: string; created_at: string }>(),
      d1
        .prepare(
          `SELECT r.id, r.status, r.source, r.excluded_at, r.elapsed_ms, r.distance_m, COALESCE(r.finished_at, r.started_at, r.created_at) AS at, c.distance_key
           FROM runs r JOIN courses c ON c.id = r.course_id WHERE r.entrant_id = ? ORDER BY at DESC`,
        )
        .bind(entrant.id)
        .all<{ id: string; status: string; source: string; excluded_at: string | null; elapsed_ms: number; distance_m: number; at: string; distance_key: string }>(),
    ]);
    const list: RunnerSession[] = sessions.results.map((s) => ({ client: s.client, device: deviceFromJson(s.device), lastSeenAt: s.last_seen_at, createdAt: s.created_at }));
    const app = list.filter((s) => s.client === 'app');
    return {
      entrant,
      createdAt: row.created_at,
      sessions: list,
      presence: { sessions: list.length, appSessions: app.length, lastSeenAt: list[0]?.lastSeenAt ?? null, device: app.find((s) => s.device)?.device ?? null },
      runs: runs.results.map((r) => ({
        id: r.id, status: r.status, source: r.source, excluded: r.excluded_at !== null, elapsedMs: r.elapsed_ms, distanceM: r.distance_m, at: r.at, distanceKey: r.distance_key,
      })),
    };
  },

  /** The race's distances, longest first: those a runner can be put on. */
  async distanceKeys(raceId: string): Promise<DistanceKey[]> {
    const { results } = await d1.prepare('SELECT distance_key FROM courses WHERE race_id = ? ORDER BY distance_m DESC').bind(raceId).all<{ distance_key: string }>();
    return results.flatMap((r) => {
      const key = DistanceKeySchema.safeParse(r.distance_key);
      return key.success ? [key.data] : [];
    });
  },

  async entrants(raceId: string): Promise<Entrant[]> {
    const { results } = await d1.prepare('SELECT * FROM entrants WHERE race_id = ?').bind(raceId).all();
    return results.map(entrantFromRow);
  },

  /** Adds one runner. False when the bib is already taken in this race. */
  async create(entrant: Entrant): Promise<boolean> {
    const { meta } = await d1
      .prepare(
        `INSERT INTO entrants (id, race_id, bib, email, first_name, last_name, distance_key, address, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(race_id, bib) DO NOTHING`,
      )
      .bind(entrant.id, entrant.raceId, entrant.bib, entrant.email, entrant.firstName, entrant.lastName, entrant.distanceKey, entrant.address ? JSON.stringify(entrant.address) : null, entrant.source)
      .run();
    return meta.changes > 0;
  },

  /** Name, email, distance and address. The bib is the runner's identity and does not change here. */
  async update(entrant: Entrant): Promise<void> {
    await d1
      .prepare('UPDATE entrants SET email = ?, first_name = ?, last_name = ?, distance_key = ?, address = ? WHERE id = ? AND race_id = ?')
      .bind(entrant.email, entrant.firstName, entrant.lastName, entrant.distanceKey, entrant.address ? JSON.stringify(entrant.address) : null, entrant.id, entrant.raceId)
      .run();
  },

  /** Removes a runner who never ran, with their codes and sessions. False, and nothing removed, when they have runs. */
  async remove(entrantId: string): Promise<boolean> {
    const runs = await d1.prepare('SELECT COUNT(*) AS n FROM runs WHERE entrant_id = ?').bind(entrantId).first<{ n: number }>();
    if ((runs?.n ?? 0) > 0) return false;
    const results = await d1.batch([
      d1.prepare('DELETE FROM auth_codes WHERE entrant_id = ?').bind(entrantId),
      d1.prepare('DELETE FROM sessions WHERE entrant_id = ?').bind(entrantId),
      d1.prepare('DELETE FROM entrants WHERE id = ? AND NOT EXISTS (SELECT 1 FROM runs WHERE entrant_id = ?)').bind(entrantId, entrantId),
    ]);
    return (results[2]?.meta.changes ?? 0) > 0;
  },

  /** Runners with an official finish, their best time and their address when they gave one: who gets a medal. */
  async medalRows(raceId: string): Promise<MedalRow[]> {
    const { results } = await d1
      .prepare(
        `SELECT e.*, MIN(r.elapsed_ms) AS best_ms FROM entrants e JOIN runs r ON r.entrant_id = e.id AND ${COUNTS_AS_FINISH}
         WHERE e.race_id = ? GROUP BY e.id ${ORDER}`,
      )
      .bind(raceId)
      .all<Record<string, unknown> & { best_ms: number }>();
    return results.map((row) => ({ entrant: entrantFromRow(row), bestMs: row.best_ms }));
  },

  /**
   * One line per runner: the best finished run when there is one, else the latest run, else
   * nothing. A finish that does not count (a rehearsal before the window, a late run, a run on
   * another distance) says `not_ranked`, never `finished`: this file is read for medals.
   */
  async resultRows(raceId: string): Promise<ResultRow[]> {
    const { results } = await d1
      .prepare(
        `SELECT e.bib, e.first_name, e.last_name, e.distance_key, r.elapsed_ms, r.distance_m,
                CASE WHEN r.excluded_at IS NOT NULL THEN 'excluded' WHEN r.source = 'simulation' THEN 'simulation'
                     WHEN r.status IN ('finished', 'uploaded') AND NOT ${COUNTS_AS_FINISH} THEN 'not_ranked' ELSE r.status END AS status, r.finished_at
         FROM entrants e LEFT JOIN runs r ON r.id = (
           SELECT r.id FROM runs r WHERE r.entrant_id = e.id
           ORDER BY CASE WHEN ${COUNTS_AS_FINISH} THEN 0 ELSE 1 END, r.elapsed_ms ASC, r.created_at DESC LIMIT 1)
         WHERE e.race_id = ? ${ORDER}`,
      )
      .bind(raceId)
      .all<{ bib: string; first_name: string; last_name: string; distance_key: string; elapsed_ms: number | null; distance_m: number | null; status: string | null; finished_at: string | null }>();
    return results.map((r) => ({
      bib: r.bib, firstName: r.first_name, lastName: r.last_name, distanceKey: r.distance_key,
      elapsedMs: r.elapsed_ms, distanceM: r.distance_m, status: r.status, finishedAt: r.finished_at,
    }));
  },

  /**
   * Idempotent on (race, bib): existing bibs are updated in place and keep their id, new ones are
   * inserted. A line without an address keeps the address already stored.
   */
  async importEntrants(raceId: string, rows: CsvEntrant[]): Promise<ImportReport> {
    if (rows.length === 0) return { inserted: 0, updated: 0 };
    const { results } = await d1.prepare('SELECT bib FROM entrants WHERE race_id = ?').bind(raceId).all<{ bib: string }>();
    const existing = new Set(results.map((r) => r.bib));
    const entrants = rows.map((r) => EntrantSchema.parse({ ...r, id: `${raceId}-${r.bib}`, raceId, source: 'import' }));
    const statements = entrants.map((e) =>
      d1
        .prepare(
          `INSERT INTO entrants (id, race_id, bib, email, first_name, last_name, distance_key, address, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(race_id, bib) DO UPDATE SET email=excluded.email, first_name=excluded.first_name, last_name=excluded.last_name,
             distance_key=excluded.distance_key, address=COALESCE(excluded.address, entrants.address)`,
        )
        .bind(e.id, e.raceId, e.bib, e.email, e.firstName, e.lastName, e.distanceKey, e.address ? JSON.stringify(e.address) : null, e.source),
    );
    // D1 batches are transactional; chunks keep each batch under the statement limit.
    await chunk(statements, 100).reduce((p, part) => p.then(() => d1.batch(part).then(() => undefined)), Promise.resolve());
    const updated = entrants.filter((e) => existing.has(e.bib)).length;
    return { inserted: entrants.length - updated, updated };
  },

  /** Bearer token -> the runner and their session, for `requireEntrant`. */
  async sessionForToken(tokenHash: string, nowIso: string): Promise<EntrantSession | null> {
    const row = await d1
      .prepare('SELECT e.*, s.id AS session_id, s.last_seen_at AS session_last_seen_at, s.device AS session_device FROM sessions s JOIN entrants e ON e.id = s.entrant_id WHERE s.token_hash = ? AND s.expires_at > ?')
      .bind(tokenHash, nowIso)
      .first<Record<string, unknown> & { session_id: string; session_last_seen_at: string | null; session_device: string | null }>();
    return row ? { id: row.session_id, entrant: entrantFromRow(row), lastSeenAt: row.session_last_seen_at, device: deviceFromJson(row.session_device) } : null;
  },

  /** A visit: when, and the phone when the request said which. */
  async recordVisit(sessionId: string, atIso: string, device: DeviceInfo | null): Promise<void> {
    await d1.prepare('UPDATE sessions SET last_seen_at = ?, device = COALESCE(?, device) WHERE id = ?').bind(atIso, device ? JSON.stringify(device) : null, sessionId).run();
  },
});

export type RunnerDb = ReturnType<typeof runnerDb>;

/**
 * When the "instructions" email went to a runner, and who sent it. Kept as one small object
 * per runner in R2 rather than a table, so no migration is needed; it only feeds a line on the
 * runner's page and the limit of a few emails a day.
 */
export type InstructionsSent = { at: string; by: string };
/** A runner gets at most this many "instructions" emails in 24 hours, whoever sends them. */
export const MAX_INSTRUCTIONS_PER_DAY = 3;
export const sentInLastDay = (sent: readonly InstructionsSent[], now: Date): number => sent.filter((s) => now.getTime() - new Date(s.at).getTime() < 86_400_000).length;
const MAX_KEPT = 20;
const instructionsKey = (entrantId: string) => `admin/instructions/${entrantId}.json`;

export const instructionsLog = (bucket: R2Bucket) => ({
  async list(entrantId: string): Promise<InstructionsSent[]> {
    const object = await bucket.get(instructionsKey(entrantId));
    if (!object) return [];
    const data = (await object.json().catch(() => null)) as { sent?: unknown } | null;
    return Array.isArray(data?.sent) ? data.sent.filter((s): s is InstructionsSent => typeof s?.at === 'string' && typeof s?.by === 'string') : [];
  },
  async add(entrantId: string, entry: InstructionsSent): Promise<void> {
    const sent = [entry, ...(await this.list(entrantId))].slice(0, MAX_KEPT);
    await bucket.put(instructionsKey(entrantId), JSON.stringify({ sent }), { httpMetadata: { contentType: 'application/json' } });
  },
  async clear(entrantId: string): Promise<void> {
    await bucket.delete(instructionsKey(entrantId));
  },
});
