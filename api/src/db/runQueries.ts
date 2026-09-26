import { z } from 'zod';
import { RunSourceSchema, RunStatusSchema } from '@sivoov/shared';
import type { Course, Entrant, Run, RunSource, RunStatus } from '@sivoov/shared';
import { COUNTS_AS_FINISH } from './dashboardQueries';
import { courseFromRow, entrantFromRow, runFromRow } from './rows';

/**
 * The organizer's reads and writes on runs (the "Activités" screens). Filters partition the
 * runs the same way the status badge reads them: set aside first, then simulated, then by status.
 */

export const RUN_FILTERS = ['all', 'finished', 'not_ranked', 'not_finished', 'running', 'excluded', 'simulated'] as const;
export const RunFilterSchema = z.enum(RUN_FILTERS).catch('all');
export type RunFilter = z.infer<typeof RunFilterSchema>;

const REAL = "r.excluded_at IS NULL AND r.source != 'simulation'";
const FILTER_SQL: Record<RunFilter, string> = {
  all: '1 = 1',
  finished: `${COUNTS_AS_FINISH} AND r.source != 'simulation'`,
  not_ranked: `${REAL} AND r.status IN ('finished', 'uploaded') AND NOT ${COUNTS_AS_FINISH}`,
  not_finished: `${REAL} AND r.status NOT IN ('finished', 'uploaded', 'running')`,
  running: `${REAL} AND r.status = 'running'`,
  excluded: 'r.excluded_at IS NOT NULL',
  simulated: "r.excluded_at IS NULL AND r.source = 'simulation'",
};

export const RUNS_PER_PAGE = 50;

export type RunListQuery = { filter: RunFilter; distance: string | null; search: string; page: number };

const RunListRowSchema = z.object({
  id: z.string(),
  status: RunStatusSchema,
  source: RunSourceSchema,
  elapsed_ms: z.number(),
  distance_m: z.number(),
  at: z.string(),
  excluded_at: z.string().nullable(),
  platform: z.string().nullable(),
  bib: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  distance_key: z.string(),
  course_distance_m: z.number(),
  ranked: z.number(),
});

export type RunListItem = {
  /** `ranked`: listed under "Arrivés", the time the results show. */
  id: string; status: RunStatus; source: RunSource; elapsedMs: number; distanceM: number; at: string; excluded: boolean; ranked: boolean;
  platform: string | null; bib: string; firstName: string; lastName: string; distanceKey: string; courseDistanceM: number;
};

export type RunList = {
  items: RunListItem[];
  /** Runs per filter, with the distance and the search applied. */
  counts: Record<RunFilter, number>;
  /** Runs per distance key, with the filter and the search applied. */
  byDistance: Record<string, number>;
  hasOlder: boolean;
};

const ExclusionRowSchema = z.object({
  excluded_at: z.string().nullable(),
  excluded_reason: z.string().nullable(),
  excluded_by: z.string().nullable(),
  trace_key: z.string().nullable(),
  created_at: z.string(),
});

export type Exclusion = { at: string; reason: string; by: string };

export type RunDetail = {
  run: Run;
  entrant: Entrant;
  course: Course;
  exclusion: Exclusion | null;
  traceKey: string | null;
  receivedAt: string;
};

const FROM = 'FROM runs r JOIN entrants e ON e.id = r.entrant_id JOIN courses c ON c.id = r.course_id';

/** The shared WHERE of the list and its counts; `?` placeholders in the order of `params`. */
const where = (raceId: string, q: { distance: string | null; search: string }, filter: RunFilter | null) => {
  const needle = `%${q.search.trim().toLowerCase()}%`;
  const clauses = [
    'e.race_id = ?',
    ...(q.distance ? ['c.distance_key = ?'] : []),
    ...(q.search.trim() ? ["(e.bib LIKE ? OR LOWER(e.first_name || ' ' || e.last_name) LIKE ? OR LOWER(e.last_name || ' ' || e.first_name) LIKE ?)"] : []),
    ...(filter ? [`(${FILTER_SQL[filter]})`] : []),
  ];
  const params = [raceId, ...(q.distance ? [q.distance] : []), ...(q.search.trim() ? [needle, needle, needle] : [])];
  return { sql: clauses.join(' AND '), params };
};

/** Only what naming an event needs from a published pack (`events`) or a studio draft (`lines`). */
const EventTitleSchema = z.object({ id: z.string(), title: z.string().optional() });
const PackTitlesSchema = z.object({ course_id: z.string(), manifest: z.string() });
const DraftTitlesSchema = z.object({ course_id: z.string(), script: z.string() });
const PackEventsSchema = z.object({ events: z.array(EventTitleSchema) });
const DraftLinesSchema = z.object({ lines: z.array(EventTitleSchema) });
const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const runDb = (d1: D1Database) => ({
  async list(raceId: string, q: RunListQuery): Promise<RunList> {
    const listed = where(raceId, q, q.filter);
    const counted = where(raceId, q, null);
    const distanced = where(raceId, { distance: null, search: q.search }, q.filter);
    const offset = (Math.max(1, q.page) - 1) * RUNS_PER_PAGE;
    const [rows, counts, byDistance] = await Promise.all([
      d1
        .prepare(
          `SELECT r.id, r.status, r.source, r.elapsed_ms, r.distance_m, r.excluded_at, json_extract(r.device, '$.platform') AS platform,
                  COALESCE(r.finished_at, r.started_at, r.created_at) AS at, e.bib, e.first_name, e.last_name, c.distance_key, c.distance_m AS course_distance_m,
                  (${FILTER_SQL.finished}) AS ranked
           ${FROM} WHERE ${listed.sql} ORDER BY at DESC, r.id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...listed.params, RUNS_PER_PAGE + 1, offset)
        .all(),
      d1
        .prepare(`SELECT ${RUN_FILTERS.map((f) => `SUM(CASE WHEN ${FILTER_SQL[f]} THEN 1 ELSE 0 END) AS "${f}"`).join(', ')} ${FROM} WHERE ${counted.sql}`)
        .bind(...counted.params)
        .first<Record<RunFilter, number | null>>(),
      d1
        .prepare(`SELECT c.distance_key, COUNT(*) AS n ${FROM} WHERE ${distanced.sql} GROUP BY c.distance_key`)
        .bind(...distanced.params)
        .all<{ distance_key: string; n: number }>(),
    ]);
    const items = rows.results.slice(0, RUNS_PER_PAGE).map((raw) => {
      const r = RunListRowSchema.parse(raw);
      return {
        id: r.id, status: r.status, source: r.source, elapsedMs: r.elapsed_ms, distanceM: r.distance_m, at: r.at, excluded: r.excluded_at !== null, ranked: r.ranked === 1,
        platform: r.platform, bib: r.bib, firstName: r.first_name, lastName: r.last_name, distanceKey: r.distance_key, courseDistanceM: r.course_distance_m,
      };
    });
    return {
      items,
      counts: Object.fromEntries(RUN_FILTERS.map((f) => [f, counts?.[f] ?? 0])) as Record<RunFilter, number>,
      byDistance: Object.fromEntries(byDistance.results.map((d) => [d.distance_key, d.n])),
      hasOlder: rows.results.length > RUNS_PER_PAGE,
    };
  },

  /** One run of this race, or null (a run of another race is not found, not forbidden). */
  async detail(raceId: string, runId: string): Promise<RunDetail | null> {
    const row = await d1.prepare('SELECT r.* FROM runs r JOIN entrants e ON e.id = r.entrant_id WHERE r.id = ? AND e.race_id = ?').bind(runId, raceId).first();
    if (!row) return null;
    const run = runFromRow(row);
    const extra = ExclusionRowSchema.parse(row);
    const [entrant, course] = await Promise.all([
      d1.prepare('SELECT * FROM entrants WHERE id = ?').bind(run.entrantId).first(),
      d1.prepare('SELECT * FROM courses WHERE id = ?').bind(run.courseId).first(),
    ]);
    if (!entrant || !course) return null;
    return {
      run,
      entrant: entrantFromRow(entrant),
      course: courseFromRow(course),
      exclusion: extra.excluded_at ? { at: extra.excluded_at, reason: extra.excluded_reason ?? '', by: extra.excluded_by ?? '' } : null,
      traceKey: extra.trace_key,
      receivedAt: extra.created_at,
    };
  },

  /** Sets a time aside. Only the organizer writes these columns; the app's re-uploads leave them alone. */
  async exclude(raceId: string, runId: string, exclusion: Exclusion): Promise<boolean> {
    const res = await d1
      .prepare('UPDATE runs SET excluded_at = ?, excluded_reason = ?, excluded_by = ? WHERE id = ? AND entrant_id IN (SELECT id FROM entrants WHERE race_id = ?)')
      .bind(exclusion.at, exclusion.reason, exclusion.by, runId, raceId)
      .run();
    return res.meta.changes > 0;
  },

  async restore(raceId: string, runId: string): Promise<boolean> {
    const res = await d1
      .prepare('UPDATE runs SET excluded_at = NULL, excluded_reason = NULL, excluded_by = NULL WHERE id = ? AND entrant_id IN (SELECT id FROM entrants WHERE race_id = ?)')
      .bind(runId, raceId)
      .run();
    return res.meta.changes > 0;
  },

  /**
   * Event id -> title, to name what the runner heard. The run's own course first (its latest
   * published announcements, then the studio's working copy), then the race's other courses:
   * an event id shared across distances is the same announcement.
   */
  async eventTitles(raceId: string, courseId: string): Promise<Map<string, string>> {
    const [packs, drafts] = await Promise.all([
      d1
        .prepare(
          `SELECT p.course_id, p.manifest FROM audio_packs p JOIN courses c ON c.id = p.course_id
           WHERE c.race_id = ? AND p.locale = 'fr' AND p.version = (SELECT MAX(p2.version) FROM audio_packs p2 WHERE p2.course_id = p.course_id AND p2.locale = 'fr')`,
        )
        .bind(raceId)
        .all(),
      d1.prepare("SELECT s.course_id, s.script FROM audio_scripts s JOIN courses c ON c.id = s.course_id WHERE c.race_id = ? AND s.locale = 'fr'").bind(raceId).all(),
    ]);
    const fromPacks = packs.results
      .map((raw) => PackTitlesSchema.parse(raw))
      .map((r) => ({ courseId: r.course_id, entries: PackEventsSchema.safeParse(safeJson(r.manifest)).data?.events ?? [] }));
    const fromDrafts = drafts.results
      .map((raw) => DraftTitlesSchema.parse(raw))
      .map((r) => ({ courseId: r.course_id, entries: DraftLinesSchema.safeParse(safeJson(r.script)).data?.lines ?? [] }));
    const own = (s: { courseId: string }) => s.courseId === courseId;
    const ordered = [...fromPacks.filter(own), ...fromDrafts.filter(own), ...fromPacks.filter((s) => !own(s)), ...fromDrafts.filter((s) => !own(s))];
    const pairs = ordered.flatMap((s) => s.entries.filter((e) => e.title).map((e) => [e.id, e.title!] as const));
    // First source wins: reversing lets the Map constructor keep the earliest pair for each id.
    return new Map([...pairs].reverse());
  },
});

export type RunDb = ReturnType<typeof runDb>;
