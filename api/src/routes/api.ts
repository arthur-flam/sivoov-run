import { Hono } from 'hono';
import { z } from 'zod';
import {
  CodeRequestSchema,
  CodeVerifySchema,
  CourseGeometrySchema,
  EntrantPublicSchema,
  LiveVoiceRequestSchema,
  RunSchema,
  RunTraceSchema,
  isRanked,
  officialStatus,
  staticMapUrl,
} from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { requireEntrant } from '../lib/auth';
import type { AuthVars } from '../lib/auth';
import { requestCode, verifyCode } from '../lib/authService';
import { forgetRunner } from '../lib/forget';
import { liveVoice, personalDeps, personalVoices, runnerFacts } from '../lib/personal';
import { loadGeometry } from '../lib/studio';
import { weatherAt } from '../lib/weather';
import { prewarmCards } from './results';

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

/** Course geometry from R2, or 404 when the organizer has not sent the GPX yet (the app then shows its own fallback). */
api.get('/courses/:id/geometry', async (c) => {
  const q = db(c.env.DB);
  const course = await q.courseById(c.req.param('id'));
  if (!course) return c.json({ error: 'not_found' }, 404);
  const object = course.geometryKey ? await c.env.FILES.get(course.geometryKey) : null;
  if (!object) return c.json({ error: 'not_found' }, 404);
  return new Response(object.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
});

/**
 * Course map as a PNG: Mapbox Static Images rendered server-side so the token stays on the
 * Worker and the app and the web pages share one cached image. 404s when no token is set.
 */
api.get('/courses/:id/map.png', async (c) => {
  const token = c.env.MAPBOX_TOKEN;
  if (!token) return c.json({ error: 'not_found' }, 404);
  const q = db(c.env.DB);
  const course = await q.courseById(c.req.param('id'));
  if (!course) return c.json({ error: 'not_found' }, 404);
  const size = z.object({ w: z.coerce.number().int().min(100).max(1280).default(720), h: z.coerce.number().int().min(100).max(1280).default(400) }).safeParse(c.req.query());
  if (!size.success) return c.json({ error: 'invalid' }, 400);
  const cache = caches.default;
  const cacheKey = new Request(new URL(c.req.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const object = course.geometryKey ? await c.env.FILES.get(course.geometryKey) : null;
  if (!object) return c.json({ error: 'not_found' }, 404);
  const geometry = CourseGeometrySchema.parse(await object.json());
  const race = await q.raceById(course.raceId);
  const color = (race?.theme.primary ?? '#e63946').replace('#', '');
  const upstream = await fetch(staticMapUrl({ points: geometry.points, token, width: size.data.w, height: size.data.h, color }));
  if (!upstream.ok) return c.json({ error: 'upstream', status: upstream.status }, 502);
  const res = new Response(upstream.body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
});

/**
 * Step 1: the email -> a code by email. 409 `ambiguous` when the email holds more than one
 * entry: the app asks for the race or the bib (`SignInAmbiguity`) and sends them with the email.
 */
api.post('/auth/code', async (c) => {
  const parsed = await parseBody(c, CodeRequestSchema);
  if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
  const result = await requestCode(c.env, parsed.data, (p) => c.executionCtx.waitUntil(p));
  if (!result.ok && result.error === 'ambiguous') return c.json({ error: result.error, races: result.races, bib: result.bib }, 409);
  if (!result.ok) return c.json({ error: result.error }, result.error === 'too_many_requests' ? 429 : 404);
  return c.json({ sent: true, ...(result.devCode ? { devCode: result.devCode } : {}) });
});

/** Step 2: the code -> a long-lived session token. The JSON API is the app's; the web signs in with forms. */
api.post('/auth/verify', async (c) => {
  const parsed = await parseBody(c, CodeVerifySchema);
  if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
  const result = await verifyCode(c.env, parsed.data, 'app');
  if (!result.ok && result.error === 'ambiguous') return c.json({ error: result.error, races: result.races, bib: result.bib }, 409);
  if (!result.ok) return c.json({ error: result.error }, result.error === 'unknown_entrant' ? 404 : 401);
  return c.json({ token: result.token, expiresAt: result.expiresAt, entrant: EntrantPublicSchema.parse(result.entrant) });
});

api.use('/me', requireEntrant);
api.use('/me/*', requireEntrant);
api.use('/runs', requireEntrant);
api.use('/runs/*', requireEntrant);

/**
 * Everything the app needs after sign-in: the entrant, the race, their course, and the Mapbox
 * public token the run screen's map draws with (the same one the admin's maps use), so a
 * token is rotated in the Worker, never in a build.
 */
api.get('/me', async (c) => {
  const entrant = c.get('entrant')!;
  const q = db(c.env.DB);
  const [race, course, runs] = await Promise.all([q.raceById(entrant.raceId), q.courseFor(entrant.raceId, entrant.distanceKey), q.runsForEntrant(entrant.id)]);
  const map = c.env.MAPBOX_TOKEN ? { token: c.env.MAPBOX_TOKEN } : null;
  return c.json({ entrant: EntrantPublicSchema.parse(entrant), race, course, runs, map });
});

const VoicesBody = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).partial();

/**
 * The runner's own versions of the personal lines of their course's latest pack, rendered and
 * ready to download with it (lib/personal.ts). The app asks from the race home and the
 * pre-flight, with its position when it has one (only for the weather, rounded, not stored).
 * An empty `files` is a normal answer: every line then plays its offline version.
 */
api.post('/me/voices', async (c) => {
  const entrant = c.get('entrant')!;
  const q = db(c.env.DB);
  const [race, course] = await Promise.all([q.raceById(entrant.raceId), q.courseFor(entrant.raceId, entrant.distanceKey)]);
  const pack = course ? await q.latestAudioPack(course.id) : null;
  if (!race || !course || !pack) return c.json({ error: 'not_found' }, 404);
  const body = VoicesBody.safeParse(await c.req.json().catch(() => ({})));
  const here = body.success && body.data.lat !== undefined && body.data.lng !== undefined ? { lat: body.data.lat, lng: body.data.lng } : null;
  const deps = personalDeps(c.env);
  // The weather only matters to lines the AI writes; the calls are skipped otherwise.
  const start = deps.llm ? (await loadGeometry(c.env.FILES, course))?.points[0] : undefined;
  const [runnerWeather, raceWeather] = deps.llm ? await Promise.all([here ? weatherAt(here) : null, start ? weatherAt(start) : null]) : [null, null];
  const voices = await personalVoices(deps, { entrantId: entrant.id, runner: runnerFacts(entrant), race, course, weather: { runner: runnerWeather, race: raceWeather } }, pack.version);
  return c.json(voices, 200, { 'Cache-Control': 'private, no-store' });
});

/** One live personal line (a split time, the finish time) rendered now. 422: a value is missing, play the offline version. */
api.post('/me/voices/live', async (c) => {
  const parsed = await parseBody(c, LiveVoiceRequestSchema);
  if (!parsed.success) return c.json({ error: 'invalid' }, 400);
  const entrant = c.get('entrant')!;
  const course = await db(c.env.DB).courseFor(entrant.raceId, entrant.distanceKey);
  if (!course || course.id !== parsed.data.courseId) return c.json({ error: 'not_found' }, 404);
  const { version, eventId, facts } = parsed.data;
  const outcome = await liveVoice(personalDeps(c.env), { entrantId: entrant.id, runner: runnerFacts(entrant) }, course.id, version, eventId, facts);
  if (!outcome.ok) return c.json({ error: outcome.detail }, outcome.status);
  return c.json({ url: outcome.url, bytes: outcome.bytes, caption: outcome.caption }, 200, { 'Cache-Control': 'private, no-store' });
});

/** « Supprimer mes données »: the runner's runs, traces, cards, AI lines and sessions go (lib/forget.ts). The session ends with them. */
api.delete('/me', async (c) => {
  const { runs } = await forgetRunner(c.env, c.get('entrant')!);
  return c.json({ ok: true, runs });
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
  // A run belongs on the entrant's own distance: another course would rank them in the wrong
  // table. A demo race's runners run on the real race's courses (`courseFor` follows `demoOf`).
  const course = await q.courseFor(entrant.raceId, entrant.distanceKey);
  if (!course || course.id !== run.courseId) return c.json({ error: 'invalid_course' }, 400);
  // Run ids come from the client: one that already belongs to someone else is not theirs to overwrite.
  const existing = await q.runById(run.id);
  if (existing && existing.entrantId !== entrant.id) return c.json({ error: 'forbidden' }, 403);
  const traceKey = trace ? `traces/${entrant.raceId}/${run.id}.json` : null;
  if (trace && traceKey) await c.env.FILES.put(traceKey, JSON.stringify(trace), { httpMetadata: { contentType: 'application/json' } });
  const status = officialStatus(run, course.distanceM);
  await q.upsertRun({ ...run, status }, traceKey);
  const race = await q.raceById(entrant.raceId);
  if (race && isRanked(race, { ...run, status })) c.executionCtx.waitUntil(prewarmCards(c.env, new URL(c.req.url).origin, race, entrant.bib).catch(() => undefined));
  return c.json({ ok: true, run: await q.runById(run.id) });
});

api.get('/runs', async (c) => c.json({ runs: await db(c.env.DB).runsForEntrant(c.get('entrant')!.id) }));
