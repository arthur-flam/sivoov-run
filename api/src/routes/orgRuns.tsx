import { Hono } from 'hono';
import { z } from 'zod';
import { RunTraceSchema, writeGpx } from '@sivoov/shared';
import type { RunTrace } from '@sivoov/shared';
import type { AppEnv, Bindings } from '../env';
import { db } from '../db/queries';
import { RunFilterSchema, runDb } from '../db/runQueries';
import type { RunDetail } from '../db/runQueries';
import { requireCan, requireOrganizer } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { distanceName } from '../pages/org/format';
import { OrgRunsPage } from '../pages/org/runs';
import { DONE_MESSAGES, ExcludeReasonSchema, reasonText } from '../pages/org/runsCopy';
import { OrgRunPage } from '../pages/org/runsDetail';
import { LEAFLET_CSS } from '../pages/org/runsMap';
import type { ReviewForm } from '../pages/org/runsReview';
import { doneMessage, orgPage } from './orgPage';
import type { OrgContext } from './orgPage';

/**
 * Activities: every run recorded by the app or sent as a file, one run in detail, its trace to
 * download, and setting a time aside. Mounted under /org.
 */
export const orgRuns = new Hono<AppEnv & { Variables: OrgVars }>();

const ListQuerySchema = z.object({
  filter: RunFilterSchema.default('all'),
  distance: z.string().trim().max(40).catch('').default(''),
  q: z.string().max(100).catch('').default(''),
  page: z.coerce.number().int().min(1).max(100_000).catch(1).default(1),
});

orgRuns.get('/:slug/runs', requireOrganizer, async (c) => {
  const race = c.get('race');
  const params = ListQuerySchema.parse(c.req.query());
  const courses = await db(c.env.DB).coursesForRace(race.id);
  // An unknown distance in the address is ignored, not an empty list.
  const distance = courses.some((x) => x.distanceKey === params.distance) ? params.distance : null;
  const query = { filter: params.filter, distance, search: params.q, page: params.page };
  const list = await runDb(c.env.DB).list(race.id, query);
  return orgPage(c, 'runs', 'Activités', <OrgRunsPage race={race} courses={courses} list={list} query={query} />);
});

type TraceRead = { trace: RunTrace | null; unreadable: boolean };

const readTrace = async (env: Bindings, key: string | null): Promise<TraceRead> => {
  const object = key ? await env.FILES.get(key) : null;
  if (!object) return { trace: null, unreadable: false };
  const parsed = RunTraceSchema.safeParse(await object.json().catch(() => null));
  return parsed.success ? { trace: parsed.data, unreadable: false } : { trace: null, unreadable: true };
};

const findRun = (c: OrgContext): Promise<RunDetail | null> => runDb(c.env.DB).detail(c.get('race').id, c.req.param('runId') ?? '');

const runPage = async (c: OrgContext, detail: RunDetail, form?: ReviewForm) => {
  const race = c.get('race');
  const [{ trace, unreadable }, titles] = await Promise.all([readTrace(c.env, detail.traceKey), runDb(c.env.DB).eventTitles(race.id, detail.course.id)]);
  // `?map=svg` draws the trace without tiles or network: the screenshot rig and a bad connection use it.
  const mapToken = c.req.query('map') === 'svg' ? null : c.env.MAPBOX_TOKEN || null;
  const name = `${detail.entrant.firstName} ${detail.entrant.lastName.toUpperCase()}`;
  return orgPage(
    c,
    'runs',
    name,
    <OrgRunPage
      race={race}
      access={c.get('access')}
      detail={detail}
      trace={trace}
      traceUnreadable={unreadable}
      titles={titles}
      mapToken={mapToken}
      done={doneMessage(c, DONE_MESSAGES)}
      form={form}
    />,
    { head: mapToken ? <link rel="stylesheet" href={LEAFLET_CSS} /> : undefined, status: form ? 422 : 200 },
  );
};

orgRuns.get('/:slug/runs/:runId', requireOrganizer, async (c) => {
  const detail = await findRun(c);
  return detail ? runPage(c, detail) : c.notFound();
});

/** A file name that survives every browser and file system. */
const fileName = (c: OrgContext, detail: RunDetail, ext: string) =>
  `${c.get('race').slug}-${detail.entrant.bib}-${detail.run.id}`.replace(/[^\w.-]+/g, '_').slice(0, 120) + `.${ext}`;

orgRuns.get('/:slug/runs/:runId/trace.gpx', requireOrganizer, async (c) => {
  const detail = await findRun(c);
  if (!detail) return c.notFound();
  const { trace } = await readTrace(c.env, detail.traceKey);
  if (!trace || trace.samples.length === 0) return c.notFound();
  const name = `${detail.entrant.firstName} ${detail.entrant.lastName}, ${distanceName(detail.course.distanceKey)}, dossard ${detail.entrant.bib}`;
  return c.body(writeGpx({ name, samples: trace.samples }), 200, {
    'Content-Type': 'application/gpx+xml; charset=utf-8',
    'Content-Disposition': `attachment; filename="${fileName(c, detail, 'gpx')}"`,
  });
});

/** The trace exactly as the phone sent it, for support. */
orgRuns.get('/:slug/runs/:runId/trace.json', requireOrganizer, async (c) => {
  const detail = await findRun(c);
  const object = detail?.traceKey ? await c.env.FILES.get(detail.traceKey) : null;
  if (!detail || !object) return c.notFound();
  return new Response(object.body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${fileName(c, detail, 'json')}"` },
  });
});

const ExcludeFormSchema = z.object({
  reason: ExcludeReasonSchema,
  note: z.string().trim().max(500, { error: '500 caractères au plus.' }).default(''),
});

orgRuns.post('/:slug/runs/:runId/exclude', requireOrganizer, requireCan('review_runs'), async (c) => {
  const detail = await findRun(c);
  if (!detail) return c.notFound();
  const body = await c.req.parseBody();
  const note = typeof body.note === 'string' ? body.note : '';
  const reason = typeof body.reason === 'string' ? body.reason : undefined;
  const parsed = ExcludeFormSchema.safeParse({ reason, note });
  if (!parsed.success) {
    const errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return runPage(c, detail, { reason, note, errors });
  }
  const exclusion = { at: new Date().toISOString(), reason: reasonText(parsed.data.reason, parsed.data.note), by: c.get('admin').email };
  await runDb(c.env.DB).exclude(c.get('race').id, detail.run.id, exclusion);
  return c.redirect(`/org/${c.get('race').slug}/runs/${encodeURIComponent(detail.run.id)}?done=excluded`);
});

orgRuns.post('/:slug/runs/:runId/restore', requireOrganizer, requireCan('review_runs'), async (c) => {
  const detail = await findRun(c);
  if (!detail) return c.notFound();
  await runDb(c.env.DB).restore(c.get('race').id, detail.run.id);
  return c.redirect(`/org/${c.get('race').slug}/runs/${encodeURIComponent(detail.run.id)}?done=restored`);
});
