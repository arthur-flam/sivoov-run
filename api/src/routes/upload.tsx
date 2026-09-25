import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { RunSchema, RunTraceSchema, evaluateUpload, officialStatus, readGpxPoints, translator } from '@sivoov/shared';
import type { Course, Entrant, Race } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { entrantForToken } from '../lib/authService';
import { Layout } from '../pages/layout';
import { UploadPage } from '../pages/upload';
import type { UploadProblem } from '../pages/upload';
import { SESSION_COOKIE, localeOf } from './pages';
import { prewarmCards } from './results';

/**
 * The GPX fallback, `/{race}/upload`, behind the web session. A 1 Hz marathon from a watch with
 * heart rate is about 5 MB; 10 MB leaves room for a six-hour walk.
 */
export const upload = new Hono<AppEnv>();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type Ctx = Context<AppEnv>;
type Signed = { race: Race; entrant: Entrant; course: Course };

/** The race, the signed-in entrant of that race and their course; or where to send the request instead. */
const signedIn = async (c: Ctx): Promise<Signed | Response> => {
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug') ?? '');
  if (!race) return c.notFound();
  const token = getCookie(c, SESSION_COOKIE);
  const entrant = token ? await entrantForToken(c.env, token) : null;
  if (!entrant || entrant.raceId !== race.id) return c.redirect(`/${race.slug}/signin?next=${encodeURIComponent(`/${race.slug}/upload`)}`);
  const course = await q.courseFor(race.id, entrant.distanceKey);
  return course ? { race, entrant, course } : c.notFound();
};

const page = (c: Ctx, { race, entrant, course }: Signed, problem?: UploadProblem, status: 200 | 400 | 413 | 422 = 200) => {
  const locale = localeOf(c);
  return c.html(
    <Layout title={`${translator(locale)('upload.title')} · ${race.theme.displayName}`} locale={locale} race={race} path={`/${race.slug}/upload`}>
      <UploadPage race={race} entrant={entrant} course={course} locale={locale} problem={problem} />
    </Layout>,
    status,
  );
};

upload.get('/:slug/upload', async (c) => {
  const signed = await signedIn(c);
  return signed instanceof Response ? signed : page(c, signed);
});

/**
 * An accepted file becomes the entrant's run, source `upload`, status `uploaded`, with every
 * point stored as its trace. The run id is the entrant plus the start instant: sending the same
 * run again, even from another export, replaces it instead of adding a second result.
 */
upload.post('/:slug/upload', async (c) => {
  const signed = await signedIn(c);
  if (signed instanceof Response) return signed;
  // Checked before the body is read, so an oversized request never sits in the Worker's memory.
  if (Number(c.req.header('Content-Length') ?? 0) > MAX_UPLOAD_BYTES) return page(c, signed, { reason: 'too_large' }, 413);
  const file = (await c.req.parseBody()).gpx;
  if (!(file instanceof File) || file.size === 0) return page(c, signed, { reason: 'no_file' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return page(c, signed, { reason: 'too_large' }, 413);

  const { race, entrant, course } = signed;
  const verdict = evaluateUpload({ points: readGpxPoints(await file.text()), course, race });
  if (!verdict.ok) return page(c, signed, verdict, 422);

  const run = RunSchema.parse({
    ...verdict.run,
    id: `upload-${entrant.id}-${Date.parse(verdict.run.startedAt)}`,
    entrantId: entrant.id,
    courseId: course.id,
    status: 'uploaded',
    source: 'upload',
  });
  const traceKey = `traces/${race.id}/${run.id}.json`;
  const trace = RunTraceSchema.parse({ runId: run.id, samples: verdict.samples, audioFired: [] });
  await c.env.FILES.put(traceKey, JSON.stringify(trace), { httpMetadata: { contentType: 'application/json' } });
  await db(c.env.DB).upsertRun({ ...run, status: officialStatus(run, course.distanceM) }, traceKey);
  c.executionCtx.waitUntil(prewarmCards(c.env, new URL(c.req.url).origin, race, entrant.bib).catch(() => undefined));
  return c.redirect(`/${race.slug}/results/${encodeURIComponent(entrant.bib)}`, 303);
});
