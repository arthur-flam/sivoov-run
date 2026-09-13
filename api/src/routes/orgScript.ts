import { Hono } from 'hono';
import { z } from 'zod';
import { AudioScriptSchema } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { scriptDb } from '../db/scriptQueries';
import { requireCourse, requireOrganizer } from '../lib/orgAuth';
import type { CourseVars } from '../lib/orgAuth';
import { publishScript } from '../lib/publish';
import { distanceForClick, loadStudioContext, paceFromQuery, studioEstimates } from '../lib/studio';
import { renderLine, ttsKey } from '../lib/tts';

/**
 * The studio's JSON half, on the organizer cookie (no bearer, no public exposure): read and
 * save the draft, render one line with ElevenLabs, stream a rendered MP3 back for the
 * "Écouter" button, project a click on the map, publish a version. The public `/api` never
 * carries script text — the pack the app downloads has titles and file keys only.
 */
export const orgScript = new Hono<AppEnv & { Variables: CourseVars }>();

const guard = [requireOrganizer, requireCourse] as const;
const PATH = '/:slug/courses/:courseId';

const LatLngBody = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const RenderBody = z.object({ lineId: z.string().min(1) });

orgScript.get(`${PATH}/script`, ...guard, async (c) => {
  const course = c.get('course');
  const ctx = await loadStudioContext(c.env, course);
  const pace = paceFromQuery(c.req.query('pace'));
  return c.json({
    script: ctx.script,
    estimates: await studioEstimates(c.env.FILES, ctx.script, course.distanceM, ctx.track, pace),
  });
});

/**
 * The whole draft, every time: the studio is a single editor and the last write wins.
 * `courseId`, `locale` and `version` come from the server — the browser cannot move a
 * version, only publishing does.
 */
orgScript.put(`${PATH}/script`, ...guard, async (c) => {
  const course = c.get('course');
  const ctx = await loadStudioContext(c.env, course);
  const body = await c.req.json().catch(() => null);
  const parsed = AudioScriptSchema.safeParse({
    ...(body as Record<string, unknown>),
    courseId: course.id,
    locale: ctx.script.locale,
    version: ctx.version,
  });
  if (!parsed.success) return c.json({ error: 'invalid', detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' ; ') }, 400);
  const ids = parsed.data.lines.map((l) => l.id);
  if (new Set(ids).size !== ids.length) return c.json({ error: 'invalid', detail: 'deux événements portent le même identifiant' }, 400);
  await scriptDb(c.env.DB).saveDraft(parsed.data);
  return c.json({
    script: parsed.data,
    estimates: await studioEstimates(c.env.FILES, parsed.data, course.distanceM, ctx.track, paceFromQuery(c.req.query('pace'))),
  });
});

/** One line to MP3. Cached in R2 by the text hash, so a second call is free. */
orgScript.post(`${PATH}/script/render`, ...guard, async (c) => {
  const course = c.get('course');
  if (!c.env.ELEVENLABS_API_TOKEN) {
    return c.json({ error: 'tts_unavailable', detail: 'La génération de voix n’est pas configurée sur cet environnement (ELEVENLABS_API_TOKEN).' }, 503);
  }
  const ctx = await loadStudioContext(c.env, course);
  const parsed = RenderBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid', detail: 'identifiant de ligne manquant' }, 400);
  const line = ctx.script.lines.find((l) => l.id === parsed.data.lineId);
  if (!line) return c.json({ error: 'not_found', detail: 'ligne inconnue' }, 404);
  if (line.slots) return c.json({ error: 'template', detail: 'les modèles ne sont pas générés ici' }, 400);
  const outcome = await renderLine({ files: c.env.FILES, apiKey: c.env.ELEVENLABS_API_TOKEN }, ctx.script.voice, line.text);
  if (!outcome.ok) return c.json({ error: 'tts_failed', detail: `ElevenLabs ${outcome.status} : ${outcome.detail}` }, 502);
  return c.json({
    ...outcome.rendered,
    estimates: await studioEstimates(c.env.FILES, ctx.script, course.distanceM, ctx.track, paceFromQuery(c.req.query('pace'))),
  });
});

/** Streams a rendered line from the `tts/` cache, for the studio's "Écouter" button. */
orgScript.get(`${PATH}/audio/:hash`, ...guard, async (c) => {
  const hash = c.req.param('hash');
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: 'invalid' }, 400);
  const object = await c.env.FILES.get(ttsKey(hash));
  if (!object) return c.json({ error: 'not_found' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(object.size),
      ETag: object.httpEtag,
      // The hash is the content: immutable, but private to the organizer session.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
    },
  });
});

/** A click on the map -> the official distance along the course, and how far off the line it was. */
orgScript.post(`${PATH}/script/project`, ...guard, async (c) => {
  const course = c.get('course');
  const ctx = await loadStudioContext(c.env, course);
  if (!ctx.track) return c.json({ error: 'no_geometry', detail: 'aucun tracé pour ce parcours' }, 409);
  const parsed = LatLngBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid' }, 400);
  return c.json(distanceForClick(ctx.track, course.distanceM, parsed.data));
});

/** Builds the pack at the draft's version, makes it live, and moves the draft on. */
orgScript.post(`${PATH}/script/publish`, ...guard, async (c) => {
  const course = c.get('course');
  const ctx = await loadStudioContext(c.env, course);
  if (ctx.script.lines.length === 0) return c.json({ error: 'empty', detail: 'le script est vide' }, 400);
  const outcome = await publishScript({ db: db(c.env.DB), scripts: scriptDb(c.env.DB), files: c.env.FILES }, ctx.script);
  if (!outcome.ok) return c.json({ error: 'missing_audio', missing: outcome.missing }, 409);
  return c.json(outcome);
});
