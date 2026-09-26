import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  AudioScriptSchema,
  SAMPLE_LIVE,
  SAMPLE_RUNNER,
  ScriptVoiceSchema,
  duplicateFileKeys,
  estimateFirings,
  fillTemplate,
  formatKm,
  spokenValues,
  supportsAudioTags,
  whenInWords,
} from '@sivoov/shared';
import type { AudioScript, ScriptLine } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { scriptDb } from '../db/scriptQueries';
import { requireCan, requireCourse, requireOrganizer } from '../lib/orgAuth';
import type { CourseVars } from '../lib/orgAuth';
import { suggestLine, writePersonalLine } from '../lib/llm';
import { briefFor, personalDeps, raceDays } from '../lib/personal';
import { publishScript, refusalText } from '../lib/publish';
import { DEFAULT_PACE_SEC_PER_KM, distanceForClick, estimatesFor, loadStudioContext, paceFromQuery } from '../lib/studio';
import type { StudioContext } from '../lib/studio';
import { renderLine, ttsKey } from '../lib/tts';
import { maySpendCredit } from '../lib/testCode';
import { UPLOAD_PREFIX, missingUploads, storeUpload } from '../lib/uploads';
import { HOUSE_VOICES, MODEL_CHOICES, STABILITY_CHOICES, accountVoices, voiceSample, voiceSummary } from '../lib/voices';
import { weatherAt } from '../lib/weather';
import { distanceName } from '../pages/org/format';
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
/** ElevenLabs ids are 20 letters and digits; anything else would only fail at render time. */
const VoiceBody = z.object({ voice: ScriptVoiceSchema.extend({ id: z.string().regex(/^[A-Za-z0-9]{10,40}$/) }) });
/** Where the studio's sample runner is, for the weather in « Écouter un exemple »: Lyon. */
const SAMPLE_POSITION = { lat: 45.76, lng: 4.84 };

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
  if (!VoiceBody.safeParse({ voice: parsed.data.voice }).success) return c.json({ error: 'invalid', detail: 'Cet identifiant de voix ne ressemble pas à un identifiant ElevenLabs.' }, 400);
  const keys = duplicateFileKeys(parsed.data.lines);
  if (keys.length > 0) return c.json({ error: 'duplicate_key', detail: `Deux annonces portent le même nom de fichier : ${keys.join(', ')}.` }, 400);
  const lost = await missingUploads(c.env.FILES, parsed.data.lines);
  if (lost.length > 0) return c.json({ error: 'unknown_file', detail: `Fichier audio introuvable pour : ${lost.map((l) => l.title || l.id).join(', ')}.` }, 400);
  return saveAndAnswer(c, ctx, parsed.data);
});

/** One line to MP3. Cached in R2 by the text hash, so a second call is free. */
orgScript.post(`${PATH}/script/render`, ...edit, async (c) => {
  if (!maySpendCredit(c.env, c.get('admin').email)) {
    return c.json({ error: 'test_account', detail: 'Un compte de test ne peut pas enregistrer la voix ici. Connectez-vous avec votre adresse.' }, 403);
  }
  if (!c.env.ELEVENLABS_API_TOKEN) {
    return c.json({ error: 'tts_unavailable', detail: 'La voix de l’annonceur n’est pas disponible ici. Vous pouvez écrire et écouter avec la voix de l’ordinateur.' }, 503);
  }
  const ctx = await loadStudioContext(c.env, c.get('course'));
  const parsed = RenderBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid', detail: 'Annonce manquante.' }, 400);
  const line = ctx.script.lines.find((l) => l.id === parsed.data.lineId);
  if (!line) return c.json({ error: 'not_found', detail: 'Cette annonce n’existe plus. Rechargez la page.' }, 404);
  if (line.audio) return c.json({ error: 'uses_file', detail: 'Cette annonce utilise votre fichier audio. Revenez à la voix pour l’enregistrer.' }, 409);
  if (line.text.trim().length === 0) return c.json({ error: 'no_text', detail: line.personal ? 'Écrivez d’abord la version hors ligne.' : 'Écrivez d’abord le texte lu.' }, 400);
  const outcome = await renderLine({ files: c.env.FILES, apiKey: c.env.ELEVENLABS_API_TOKEN }, ctx.script.voice, line.text, ctx.script.locale);
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
  if (!outcome.ok) return c.json({ error: outcome.reason === 'fix' ? 'to_fix' : 'missing_audio', detail: refusalText(outcome), missing: outcome.missing }, 409);
  return c.json(outcome);
});

const ttsUnavailable = { error: 'tts_unavailable', detail: 'La voix de l’annonceur n’est pas disponible ici.' } as const;
const testAccount = { error: 'test_account', detail: 'Un compte de test ne peut pas enregistrer la voix ici. Connectez-vous avec votre adresse.' } as const;

/**
 * The voices on offer: the house list (checked with our key), the account's own voices when the
 * key may read them, and the models and settings, with the current choice. Changing the voice is
 * a script save (`PUT script` with `voice`): every line then needs its voice recorded again.
 */
orgScript.get(`${PATH}/voices`, ...guard, async (c) => {
  const ctx = await loadStudioContext(c.env, c.get('course'));
  const account = await accountVoices(c.env.ELEVENLABS_API_TOKEN);
  return c.json({
    current: ctx.script.voice,
    label: voiceSummary(ctx.script.voice),
    house: HOUSE_VOICES,
    account: account.voices,
    accountNote:
      account.voices !== null
        ? null
        : account.reason === 'no_permission'
          ? 'Pour voir ici les voix de votre compte ElevenLabs (dont les voix françaises ajoutées depuis la Voice Library), donnez à la clé la permission « Voices : read ».'
          : null,
    models: MODEL_CHOICES,
    stabilities: STABILITY_CHOICES,
  });
});

/** Auditions a voice on one sentence with the race's name, without changing the script. Cached like any render. */
orgScript.post(`${PATH}/voice/sample`, ...edit, async (c) => {
  if (!maySpendCredit(c.env, c.get('admin').email)) return c.json(testAccount, 403);
  if (!c.env.ELEVENLABS_API_TOKEN) return c.json(ttsUnavailable, 503);
  const parsed = VoiceBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid', detail: 'Cet identifiant de voix ne ressemble pas à un identifiant ElevenLabs.' }, 400);
  const voice = parsed.data.voice;
  const text = voiceSample(c.get('race').name, voice);
  const outcome = await renderLine({ files: c.env.FILES, apiKey: c.env.ELEVENLABS_API_TOKEN }, voice, text);
  if (!outcome.ok) {
    const unknown = outcome.status === 404 || outcome.status === 400 || outcome.status === 402;
    return c.json({ error: 'tts_failed', detail: unknown ? 'ElevenLabs ne connaît pas cette voix pour ce compte. Ajoutez-la à « My Voices » sur ElevenLabs, puis réessayez.' : `La voix n’a pas pu être enregistrée (ElevenLabs ${outcome.status}).` }, 502);
  }
  return c.json({ text, audioPath: `/audio/${outcome.rendered.hash}` });
});

/**
 * « Écouter un exemple » for a personal line: the sentence as Camille Martin, dossard 1247, from
 * Lyon, would hear it (at km 12 for a live line), written by the AI for an `ai` line, and read by
 * the voice when it is available. The text always comes back, so the browser can read it otherwise.
 */
orgScript.post(`${PATH}/script/sample`, ...edit, async (c) => {
  const ctx = await loadStudioContext(c.env, c.get('course'));
  const parsed = RenderBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid', detail: 'Annonce manquante.' }, 400);
  const line = ctx.script.lines.find((l) => l.id === parsed.data.lineId);
  if (!line) return c.json({ error: 'not_found', detail: 'Cette annonce n’existe plus. Rechargez la page.' }, 404);
  if (!line.personal) return c.json({ error: 'not_personal', detail: 'Cette annonce est la même pour tous.' }, 400);
  const race = c.get('race');
  const deps = personalDeps(c.env);
  const text =
    line.personal.kind === 'template'
      ? fillTemplate(line.personal.template, spokenValues(SAMPLE_RUNNER, { ...SAMPLE_LIVE, finish: line.trigger.kind === 'finish', elapsedS: line.trigger.kind === 'finish' ? 13579 : SAMPLE_LIVE.elapsedS }))
      : deps.llm
        ? await (async () => {
            const start = ctx.geometry?.points[0];
            const [here, there] = await Promise.all([weatherAt(SAMPLE_POSITION), start ? weatherAt(start) : null]);
            const def = { title: line.title, when: whenInWords(line.trigger), fallback: line.text, personal: line.personal! };
            return writePersonalLine(deps.llm!, briefFor(def, { runner: SAMPLE_RUNNER, race, weather: { runner: here, race: there } }, supportsAudioTags(ctx.script.voice.model)));
          })()
        : null;
  if (text === null) {
    const detail = line.personal.kind === 'ai' && !deps.llm ? 'L’IA n’est pas configurée ici : la version hors ligne serait jouée.' : 'Cet exemple ne peut pas être dit : la version hors ligne serait jouée.';
    return c.json({ error: 'no_sample', detail }, line.personal.kind === 'ai' && !deps.llm ? 503 : 422);
  }
  if (!c.env.ELEVENLABS_API_TOKEN || !maySpendCredit(c.env, c.get('admin').email)) return c.json({ text, audioPath: null });
  const outcome = await renderLine({ files: c.env.FILES, apiKey: c.env.ELEVENLABS_API_TOKEN }, ctx.script.voice, text, ctx.script.locale);
  return c.json({ text, audioPath: outcome.ok ? `/audio/${outcome.rendered.hash}` : null });
});

/** « Proposer un texte »: Claude drafts the sentence everyone hears, from the race, its places and the neighbouring lines. */
orgScript.post(`${PATH}/script/suggest`, ...edit, async (c) => {
  const deps = personalDeps(c.env);
  if (!deps.llm) return c.json({ error: 'ai_unavailable', detail: 'L’IA n’est pas configurée ici.' }, 503);
  const course = c.get('course');
  const race = c.get('race');
  const ctx = await loadStudioContext(c.env, course);
  const parsed = RenderBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid', detail: 'Annonce manquante.' }, 400);
  const line = ctx.script.lines.find((l) => l.id === parsed.data.lineId);
  if (!line) return c.json({ error: 'not_found', detail: 'Cette annonce n’existe plus. Rechargez la page.' }, 404);
  const order = [...new Set(estimateFirings(ctx.script.lines, course.distanceM, DEFAULT_PACE_SEC_PER_KM).map((f) => f.eventId))];
  const at = order.indexOf(line.id);
  const textOf = (id: string) => ctx.script.lines.find((l) => l.id === id);
  const around = (ids: string[]) => ids.map(textOf).flatMap((l) => (l && l.text.trim() ? [`${whenInWords(l.trigger)} : ${l.text.trim()}`] : []));
  const text = await suggestLine(deps.llm, {
    race: { name: race.name, city: race.city, date: raceDays(race), distance: distanceName(course.distanceKey), distanceKm: formatKm(course.distanceM, 'fr', 3) },
    landmarks: course.landmarks.map((l) => ({ name: l.name, km: formatKm(l.meters, 'fr', 1), note: l.description ?? '' })),
    line: { title: line.title, when: whenInWords(line.trigger), category: line.category, current: line.text, personal: Boolean(line.personal) },
    before: around(order.slice(Math.max(0, at - 2), Math.max(0, at))),
    after: around(order.slice(at + 1, at + 3)),
    tags: supportsAudioTags(ctx.script.voice.model),
  });
  if (text === null) return c.json({ error: 'no_suggestion', detail: 'Pas de proposition cette fois. Réessayez dans un instant.' }, 502);
  return c.json({ text });
});
