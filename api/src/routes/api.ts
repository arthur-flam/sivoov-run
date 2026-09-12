import { Hono } from 'hono';
import { z } from 'zod';
import {
  CodeRequestSchema,
  CodeVerifySchema,
  CourseGeometrySchema,
  EntrantPublicSchema,
  RunSchema,
  RunTraceSchema,
  deauvilleMarathonGeometry,
} from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { requireEntrant } from '../lib/auth';
import type { AuthVars } from '../lib/auth';
import { requestCode, verifyCode } from '../lib/authService';

export const api = new Hono<AppEnv & { Variables: Partial<AuthVars> }>();

const parseBody = async <T extends z.ZodType>(c: { req: { json: () => Promise<unknown> } }, schema: T) => {
  const body = await c.req.json().catch(() => null);
  return schema.safeParse(body);
};

api.get('/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT, time: new Date().toISOString() }));

api.get('/races', async (c) => c.json({ races: await db(c.env.DB).races() }));

api.get('/races/:slug', async (c) => {
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  if (!race) return c.json({ error: 'not_found' }, 404);
  return c.json({ race, courses: await q.coursesForRace(race.id) });
});

/** Course geometry: from R2 when uploaded, else the bundled Deauville fixture (dev). */
api.get('/courses/:id/geometry', async (c) => {
  const q = db(c.env.DB);
  const course = await q.courseById(c.req.param('id'));
  if (!course) return c.json({ error: 'not_found' }, 404);
  const object = course.geometryKey ? await c.env.FILES.get(course.geometryKey) : null;
  if (object) return new Response(object.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
  return c.json(CourseGeometrySchema.parse({ ...deauvilleMarathonGeometry, courseId: course.id }));
});

/** Step 1: bib + email -> a code by email. */
api.post('/auth/code', async (c) => {
  const parsed = await parseBody(c, CodeRequestSchema);
  if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
  const result = await requestCode(c.env, parsed.data, (p) => c.executionCtx.waitUntil(p));
  if (!result.ok) return c.json({ error: result.error }, result.error === 'too_many_requests' ? 429 : 404);
  return c.json({ sent: true, ...(result.devCode ? { devCode: result.devCode } : {}) });
});

/** Step 2: the code -> a long-lived session token for the app or the web. */
api.post('/auth/verify', async (c) => {
  const parsed = await parseBody(c, CodeVerifySchema);
  if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
  const result = await verifyCode(c.env, parsed.data);
  if (!result.ok) return c.json({ error: result.error }, result.error === 'unknown_entrant' ? 404 : 401);
  return c.json({ token: result.token, expiresAt: result.expiresAt, entrant: EntrantPublicSchema.parse(result.entrant) });
});

api.use('/me', requireEntrant);
api.use('/me/*', requireEntrant);
api.use('/runs', requireEntrant);
api.use('/runs/*', requireEntrant);

/** Everything the app needs after sign-in: the entrant, the race, their course. */
api.get('/me', async (c) => {
  const entrant = c.get('entrant')!;
  const q = db(c.env.DB);
  const [race, course, runs] = await Promise.all([q.raceById(entrant.raceId), q.courseFor(entrant.raceId, entrant.distanceKey), q.runsForEntrant(entrant.id)]);
  return c.json({ entrant: EntrantPublicSchema.parse(entrant), race, course, runs });
});

api.post('/me/signout', async (c) => {
  await db(c.env.DB).deleteSession(c.get('tokenHash')!);
  return c.json({ ok: true });
});

const SlotSchema = z.object({ slotAt: z.iso.datetime({ offset: true }).nullable() });
api.put('/me/slot', async (c) => {
  const parsed = await parseBody(c, SlotSchema);
  if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
  await db(c.env.DB).setSlot(c.get('entrant')!.id, parsed.data.slotAt);
  return c.json({ ok: true });
});

/** A finished run (or its progress) with its trace. Idempotent on run id: retries are safe. */
const RunUploadSchema = z.object({ run: RunSchema, trace: RunTraceSchema.optional() });
api.put('/runs/:id', async (c) => {
  const entrant = c.get('entrant')!;
  const parsed = await parseBody(c, RunUploadSchema);
  if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
  const { run, trace } = parsed.data;
  if (run.id !== c.req.param('id') || run.entrantId !== entrant.id) return c.json({ error: 'forbidden' }, 403);
  const q = db(c.env.DB);
  const course = await q.courseById(run.courseId);
  if (!course || course.raceId !== entrant.raceId) return c.json({ error: 'invalid_course' }, 400);
  const traceKey = trace ? `traces/${entrant.raceId}/${run.id}.json` : null;
  if (trace && traceKey) await c.env.FILES.put(traceKey, JSON.stringify(trace), { httpMetadata: { contentType: 'application/json' } });
  await q.upsertRun(run, traceKey);
  return c.json({ ok: true, run: await q.runById(run.id) });
});

api.get('/runs', async (c) => c.json({ runs: await db(c.env.DB).runsForEntrant(c.get('entrant')!.id) }));
