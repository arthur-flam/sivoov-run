import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { AudioScriptSchema, duplicateFileKeys, whenInWords } from '@sivoov/shared';
import type { AudioScript, ScriptLine } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { scriptDb } from '../db/scriptQueries';
import { requireCan, requireCourse, requireOrganizer } from '../lib/orgAuth';
import type { CourseVars } from '../lib/orgAuth';
import { publishScript } from '../lib/publish';
import { distanceForClick, estimatesFor, loadStudioContext, paceFromQuery } from '../lib/studio';
import type { StudioContext } from '../lib/studio';
import { renderLine, ttsKey } from '../lib/tts';
import { UPLOAD_PREFIX, missingUploads, storeUpload } from '../lib/uploads';
import { UPLOAD_ERRORS } from '../pages/org/studioCopy';

/**
 * The studio's JSON half, on the organizer cookie (no bearer, no public exposure): read and
 * save the draft, render one line with ElevenLabs, put the organizer's own sound file on a
 * line or take it off, stream a sound back for the "Écouter" button, project a click on the
 * map, publish a version. The public `/api` never carries script text: the pack the app
 * downloads has titles and file keys only. `detail` is always a sentence for the organizer.
 */
export const orgScript = new Hono<AppEnv & { Variables: CourseVars }>();

const guard = [requireOrganizer, requireCourse] as const;
/** Writing the script, rendering the voice, sound files and publishing need the audio right; reading and listening do not. */
const edit = [requireOrganizer, requireCan('edit_audio'), requireCourse] as const;
const PATH = '/:slug/courses/:courseId';

const LatLngBody = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const RenderBody = z.object({ lineId: z.string().min(1) });

type ScriptContext = Context<AppEnv & { Variables: CourseVars }>;

/** The draft and its estimates: the answer to every read and write, so the page repaints from one shape. */
const answer = async (c: ScriptContext, ctx: StudioContext, script: AudioScript, updatedAt?: string | null) =>
  ({
    script,
    estimates: await estimatesFor(c.env, c.get('course'), ctx, script, paceFromQuery(c.req.query('pace')), c.get('race').timezone, updatedAt),
  }) as const;

/** Saves a new version of the draft (same version number: only publishing moves it) and answers with it. */
const saveAndAnswer = async (c: ScriptContext, ctx: StudioContext, script: AudioScript) => {
  await scriptDb(c.env.DB).saveDraft(script);
  return c.json(await answer(c, ctx, script, new Date().toISOString()));
};

orgScript.get(`${PATH}/script`, ...guard, async (c) => {
  const ctx = await loadStudioContext(c.env, c.get('course'));
  return c.json(await answer(c, ctx, ctx.script));
});

/**
 * The whole draft, every time: the studio is a single editor and the last write wins.
 * `courseId`, `locale`, `version` and the publication mark come from the server: the browser
 * cannot move a version, only publishing does. A line may only name a sound file the Worker stored.
 */
orgScript.put(`${PATH}/script`, ...edit, async (c) => {
  const course = c.get('course');
  const ctx = await loadStudioContext(c.env, course);
  const body = await c.req.json().catch(() => null);
  const parsed = AudioScriptSchema.safeParse({
    ...(body as Record<string, unknown>),
    courseId: course.id,
    locale: ctx.script.locale,
    version: ctx.version,
    published: ctx.script.published,
  });
  if (!parsed.success) return c.json({ error: 'invalid', detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' ; ') }, 400);
  const ids = parsed.data.lines.map((l) => l.id);
  if (new Set(ids).size !== ids.length) return c.json({ error: 'invalid', detail: 'Deux annonces portent le même identifiant.' }, 400);
  const keys = duplicateFileKeys(parsed.data.lines);
  if (keys.length > 0) return c.json({ error: 'duplicate_key', detail: `Deux annonces portent le même nom de fichier : ${keys.join(', ')}.` }, 400);
  const lost = await missingUploads(c.env.FILES, parsed.data.lines);
  if (lost.length > 0) return c.json({ error: 'unknown_file', detail: `Fichier audio introuvable pour : ${lost.map((l) => l.title || l.id).join(', ')}.` }, 400);
  return saveAndAnswer(c, ctx, parsed.data);
});

/** One line to MP3. Cached in R2 by the text hash, so a second call is free. */
orgScript.post(`${PATH}/script/render`, ...edit, async (c) => {
  if (!c.env.ELEVENLABS_API_TOKEN) {
    return c.json({ error: 'tts_unavailable', detail: 'La voix de l’annonceur n’est pas disponible ici. Vous pouvez écrire et écouter avec la voix de l’ordinateur.' }, 503);
  }
  const ctx = await loadStudioContext(c.env, c.get('course'));
  const parsed = RenderBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid', detail: 'Annonce manquante.' }, 400);
  const line = ctx.script.lines.find((l) => l.id === parsed.data.lineId);
  if (!line) return c.json({ error: 'not_found', detail: 'Cette annonce n’existe plus. Rechargez la page.' }, 404);
  if (line.audio) return c.json({ error: 'uses_file', detail: 'Cette annonce utilise votre fichier audio. Revenez à la voix pour l’enregistrer.' }, 409);
  if (line.slots) return c.json({ error: 'template', detail: 'Une annonce avec une partie variable s’affiche à l’écran : elle n’est pas enregistrée.' }, 400);
  const outcome = await renderLine({ files: c.env.FILES, apiKey: c.env.ELEVENLABS_API_TOKEN }, ctx.script.voice, line.text);
  if (!outcome.ok) return c.json({ error: 'tts_failed', detail: `La voix n’a pas pu être enregistrée (ElevenLabs ${outcome.status}). Réessayez dans un instant.` }, 502);
  return c.json({ ...outcome.rendered, ...(await answer(c, ctx, ctx.script)) });
});

/**
 * The organizer's own sound for one line (multipart, field `file`): checked by its bytes,
 * stored by content hash, and recorded on the line. From then on the line plays that file,
 * in "Écouter" and in the published pack, instead of the voice.
 */
orgScript.post(`${PATH}/script/lines/:lineId/audio`, ...edit, async (c) => {
  const ctx = await loadStudioContext(c.env, c.get('course'));
  const lineId = c.req.param('lineId');
  if (!ctx.script.lines.some((l) => l.id === lineId)) return c.json({ error: 'not_found', detail: 'Cette annonce n’existe plus. Rechargez la page.' }, 404);
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const file = form.file;
  if (!(file instanceof File)) return c.json({ error: 'empty', detail: UPLOAD_ERRORS.empty }, 400);
  const stored = await storeUpload(c.env.FILES, file.name, await file.arrayBuffer());
  if (!stored.ok) return c.json({ error: stored.error, detail: UPLOAD_ERRORS[stored.error] }, stored.error === 'too_big' ? 413 : stored.error === 'not_audio' ? 415 : 400);
  const script = { ...ctx.script, lines: ctx.script.lines.map((l) => (l.id === lineId ? { ...l, audio: stored.audio } : l)) };
  return saveAndAnswer(c, ctx, script);
});

const withoutFile = ({ audio: _audio, ...line }: ScriptLine): ScriptLine => line;

/** "Revenir à la voix": the line forgets its file and is read by the voice again. The file stays stored. */
orgScript.delete(`${PATH}/script/lines/:lineId/audio`, ...edit, async (c) => {
  const ctx = await loadStudioContext(c.env, c.get('course'));
  const lineId = c.req.param('lineId');
  if (!ctx.script.lines.some((l) => l.id === lineId)) return c.json({ error: 'not_found', detail: 'Cette annonce n’existe plus. Rechargez la page.' }, 404);
  const script = { ...ctx.script, lines: ctx.script.lines.map((l) => (l.id === lineId ? withoutFile(l) : l)) };
  return saveAndAnswer(c, ctx, script);
});

/** Streams one R2 object to the organizer: private, and immutable because the name is the content hash. */
const streamPrivate = async (files: R2Bucket, key: string, fallbackType: string): Promise<Response | null> => {
  const object = await files.get(key);
  if (!object) return null;
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? fallbackType,
      'Content-Length': String(object.size),
      ETag: object.httpEtag,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
    },
  });
};

/** Streams a rendered line from the `tts/` cache, for the studio's "Écouter" button. */
orgScript.get(`${PATH}/audio/:hash`, ...guard, async (c) => {
  const hash = c.req.param('hash');
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: 'invalid' }, 400);
  return (await streamPrivate(c.env.FILES, ttsKey(hash), 'audio/mpeg')) ?? c.json({ error: 'not_found' }, 404);
});

/** Streams an organizer's uploaded file (`<hash>.<format>`), for the same button. */
orgScript.get(`${PATH}/uploads/:file`, ...guard, async (c) => {
  const file = c.req.param('file');
  if (!/^[0-9a-f]{64}\.(mp3|m4a|wav)$/.test(file)) return c.json({ error: 'invalid' }, 400);
  return (await streamPrivate(c.env.FILES, `${UPLOAD_PREFIX}${file}`, 'application/octet-stream')) ?? c.json({ error: 'not_found' }, 404);
});

/** A click on the map -> the official distance along the course, how far off the line it was, and those words. */
orgScript.post(`${PATH}/script/project`, ...guard, async (c) => {
  const course = c.get('course');
  const ctx = await loadStudioContext(c.env, course);
  if (!ctx.track) return c.json({ error: 'no_geometry', detail: 'Ce parcours n’a pas encore de tracé.' }, 409);
  const parsed = LatLngBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid' }, 400);
  const found = distanceForClick(ctx.track, course.distanceM, parsed.data);
  return c.json({ ...found, when: whenInWords({ kind: 'distance', meters: found.meters }) });
});

/** Builds the pack at the draft's version, makes it live, and moves the draft on. */
orgScript.post(`${PATH}/script/publish`, ...edit, async (c) => {
  const ctx = await loadStudioContext(c.env, c.get('course'));
  if (ctx.script.lines.length === 0) return c.json({ error: 'empty', detail: 'Ajoutez une annonce pour pouvoir publier.' }, 400);
  const outcome = await publishScript({ db: db(c.env.DB), scripts: scriptDb(c.env.DB), files: c.env.FILES }, ctx.script);
  if (!outcome.ok) return c.json({ error: 'missing_audio', detail: `Il manque le son de : ${outcome.missing.map((m) => m.title || m.id).join(', ')}.`, missing: outcome.missing }, 409);
  return c.json(outcome);
});
