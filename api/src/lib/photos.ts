import { Buffer } from 'node:buffer';
import { IMAGE_TYPES, RENDER_STALE_MS, canTryAgain, checkImage, courseMoments, isStale, photoBudget, remixPrompt, sniffImage, stripJpegMetadata } from '@sivoov/shared';
import type { Course, Entrant, PhotoMoment, Race, RunnerPhoto } from '@sivoov/shared';
import type { Bindings } from '../env';
import { photoQueries } from '../db/photoQueries';
import { newId } from './crypto';
import { maySpendCredit } from './testCode';

/**
 * Photo moments in the Worker: a runner's photo is stored (private, R2 `selfies/`), then an image
 * model is asked to put them into their race, with the organizer's photos of the place, and the
 * picture is stored (R2 `photos/`). The model is Google's Gemini image model, reached through the
 * AI Gateway like every model call. `fetchImpl` lets the tests stand in for it.
 */

export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

/**
 * `stand-in`: the "picture" is the runner's own photo, so the pages and the screenshots can walk
 * the whole flow without the model: on a local Worker with no key, and for test accounts
 * everywhere (`maySpendCredit`: App Review's public sign-in never spends credit).
 */
export type RemixDeps = { files: R2Bucket; gemini?: { apiKey: string; gateway: string }; model: string; standIn?: boolean; fetchImpl?: typeof fetch };

export const remixDeps = (env: Bindings, email: string): RemixDeps => {
  const gemini = env.GEMINI_API_KEY && env.CF_ACCOUNT_ID && env.AI_GATEWAY ? { apiKey: env.GEMINI_API_KEY, gateway: `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY}` } : undefined;
  const paid = maySpendCredit(env, email);
  return {
    files: env.FILES,
    model: env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    standIn: (env.ENVIRONMENT === 'local' && !env.GEMINI_API_KEY) || (!paid && !!gemini),
    ...(paid && gemini ? { gemini } : {}),
  };
};

export const remixEnabled = (deps: Pick<RemixDeps, 'gemini' | 'standIn'>): boolean => Boolean(deps.gemini || deps.standIn);

export type Picture = { bytes: Uint8Array; contentType: string };
export type Rendered = { ok: true; picture: Picture } | { ok: false; reason: 'unavailable' | 'refused' | 'error'; detail: string };

/** What Gemini answers: the picture is the first part carrying inline data. */
type GeminiAnswer = {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }>;
  promptFeedback?: { blockReason?: string };
};

const part = (p: Picture) => ({ inlineData: { mimeType: p.contentType, data: Buffer.from(p.bytes).toString('base64') } });

/** One call to the image model: the prompt, the runner's photo first, then the place's photos. */
export const renderRemix = async (deps: RemixDeps, prompt: string, selfie: Picture, refs: Picture[]): Promise<Rendered> => {
  if (!deps.gemini) return deps.standIn ? { ok: true, picture: selfie } : { ok: false, reason: 'unavailable', detail: 'no Gemini key' };
  const res = await (deps.fetchImpl ?? fetch)(`${deps.gemini.gateway}/google-ai-studio/v1beta/models/${deps.model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': deps.gemini.apiKey, 'Content-Type': 'application/json', 'cf-aig-skip-cache': 'true' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, part(selfie), ...refs.map(part)] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } },
    }),
  }).catch((e: unknown) => e as Error);
  if (res instanceof Error) return { ok: false, reason: 'error', detail: `network: ${res.message}` };
  if (!res.ok) return { ok: false, reason: 'error', detail: `${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}` };
  const answer = (await res.json().catch(() => ({}))) as GeminiAnswer;
  const data = answer.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!data) {
    const why = answer.promptFeedback?.blockReason ?? answer.candidates?.[0]?.finishReason ?? 'no image';
    return { ok: false, reason: 'refused', detail: why };
  }
  const bytes = Uint8Array.from(Buffer.from(data, 'base64'));
  const kind = sniffImage(bytes);
  return kind ? { ok: true, picture: { bytes, contentType: IMAGE_TYPES[kind].contentType } } : { ok: false, reason: 'error', detail: 'not an image' };
};

const read = async (files: R2Bucket, key: string): Promise<Picture | null> => {
  const object = await files.get(key);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const kind = sniffImage(bytes);
  return kind ? { bytes, contentType: IMAGE_TYPES[kind].contentType } : null;
};

/**
 * One photo put into one moment: the place's photos read from R2, the prompt, the model. The
 * runner's pictures and the organizer's « Essayer avec votre photo » both come through here.
 */
export const renderForMoment = async (deps: RemixDeps, race: Race, moment: PhotoMoment, selfie: Picture, bib: string): Promise<Rendered> => {
  const refs = (await Promise.all(moment.refs.map((key) => read(deps.files, key)))).filter((p): p is Picture => p !== null);
  const prompt = remixPrompt({ raceName: race.theme.displayName, city: race.city, title: moment.title, scene: moment.scene, bib, refs: refs.length, finish: moment.at === 'finish' });
  return renderRemix(deps, prompt, selfie, refs);
};

/** Why a selfie was not taken. The web page says it in a sentence, the app gets it as a code. */
export type SelfieRefusal = 'unknown' | 'unavailable' | 'consent' | 'no_file' | 'too_big' | 'type' | 'no_more';

export const REFUSAL_STATUS: Record<SelfieRefusal, 400 | 404 | 413 | 422 | 429> = {
  unknown: 404,
  unavailable: 422,
  consent: 400,
  no_file: 400,
  too_big: 413,
  type: 400,
  no_more: 429,
};

type Accepted = { ok: true; photo: RunnerPhoto; moment: PhotoMoment } | { ok: false; reason: SelfieRefusal; momentId?: string };

/**
 * A selfie sent for a moment, from the web page or the app: the moment must be on the runner's
 * course, pictures must be possible here, the runner must have agreed, tries must be left. The
 * photo is stored privately and `waiting` for its picture; one sent again for the same moment
 * replaces the first (the tries carry over).
 */
export const acceptSelfie = async (
  env: Bindings,
  entrant: Entrant,
  course: Course,
  momentId: string,
  body: { consent?: unknown; photo?: unknown },
  nowMs = Date.now(),
): Promise<Accepted> => {
  const q = photoQueries(env.DB);
  const moment = await q.moment(entrant.raceId, momentId);
  if (!moment || courseMoments([moment], course).length === 0) return { ok: false, reason: 'unknown' };
  const refuse = (reason: SelfieRefusal): Accepted => ({ ok: false, reason, momentId: moment.id });
  if (!remixEnabled(remixDeps(env, entrant.email))) return refuse('unavailable');
  if (body.consent !== 'on') return refuse('consent');
  const file = body.photo;
  if (!(file instanceof File) || file.size === 0) return refuse('no_file');
  const existing = (await q.photos(entrant.id)).find((p) => p.momentId === moment.id);
  if (existing && !canTryAgain(existing, nowMs)) return refuse('no_more');
  if ((await q.rendersUsed(entrant.id)) >= photoBudget((await q.moments(entrant.raceId)).length)) return refuse('no_more');
  const sent = new Uint8Array(await file.arrayBuffer());
  const check = checkImage(sent, 'selfie');
  if (!check.ok) return refuse(check.error === 'too_big' ? 'too_big' : 'type');
  const id = existing?.id ?? newId();
  const type = IMAGE_TYPES[check.kind];
  const selfieKey = `selfies/${entrant.raceId}/${entrant.id}/${id}.${type.ext}`;
  // The page drops the EXIF when it shrinks the photo; without the page's script it is done here.
  await env.FILES.put(selfieKey, stripJpegMetadata(sent), { httpMetadata: { contentType: type.contentType } });
  if (existing && existing.selfieKey !== selfieKey) await env.FILES.delete(existing.selfieKey);
  const nowIso = new Date(nowMs).toISOString();
  const photo: RunnerPhoto = {
    id,
    entrantId: entrant.id,
    momentId: moment.id,
    selfieKey,
    status: 'waiting',
    resultKey: existing?.resultKey,
    attempts: existing?.attempts ?? 0,
    shown: existing?.shown ?? false,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  await q.upsertPhoto(photo);
  return { ok: true, photo, moment };
};

/**
 * Makes the picture for a photo, once at a time (`claimRender`), and keeps it only if the photo
 * is still there when the model answers (`finishRender`: deleted meanwhile, it stays deleted).
 * A failure keeps the previous picture, if any, and says why for the organizer.
 */
export const makePhoto = async (env: Bindings, deps: RemixDeps, race: Race, entrant: Entrant, moment: PhotoMoment, photo: RunnerPhoto, nowMs = Date.now()): Promise<RunnerPhoto> => {
  const q = photoQueries(env.DB);
  const claimed = await q.claimRender(photo.id, new Date(nowMs).toISOString(), new Date(nowMs - RENDER_STALE_MS).toISOString());
  if (!claimed) return (await q.photo(entrant.id, photo.id)) ?? photo;
  const finish = async (fields: Partial<RunnerPhoto>): Promise<RunnerPhoto> => {
    const next: RunnerPhoto = { ...photo, attempts: photo.attempts + 1, updatedAt: new Date().toISOString(), ...fields };
    const kept = await q.finishRender(next);
    if (!kept && fields.resultKey) await env.FILES.delete(fields.resultKey);
    return next;
  };
  const budget = photoBudget((await q.moments(race.id)).length);
  if (!(await q.spendRender(entrant.id, budget))) return finish({ status: photo.resultKey ? 'done' : 'failed', error: 'no tries left' });
  const selfie = await read(env.FILES, photo.selfieKey);
  if (!selfie) return finish({ status: 'failed', error: 'selfie missing' });
  const rendered = await renderForMoment(deps, race, moment, selfie, entrant.bib);
  if (!rendered.ok) {
    console.error('photo render failed', photo.id, rendered.reason, rendered.detail);
    return finish({ status: photo.resultKey ? 'done' : 'failed', error: `${rendered.reason}: ${rendered.detail}` });
  }
  const kind = sniffImage(rendered.picture.bytes) ?? 'png';
  const resultKey = `photos/${entrant.raceId}/${entrant.id}/${photo.id}-${photo.attempts + 1}.${IMAGE_TYPES[kind].ext}`;
  await env.FILES.put(resultKey, rendered.picture.bytes, { httpMetadata: { contentType: rendered.picture.contentType } });
  const made = await finish({ status: 'done', resultKey, error: undefined });
  if (photo.resultKey && photo.resultKey !== resultKey) await env.FILES.delete(photo.resultKey);
  return made;
};

/** How many pictures one runner's request makes at once: a Worker holds six connections, R2 included. */
const AT_ONCE = 3;

/**
 * After the run: every photo still waiting (or whose making was lost) gets its picture, three at
 * a time. The app calls it from the finish screen and the home.
 */
export const makeWaiting = async (env: Bindings, deps: RemixDeps, race: Race, entrant: Entrant, nowMs = Date.now()): Promise<RunnerPhoto[]> => {
  const q = photoQueries(env.DB);
  const [photos, moments] = await Promise.all([q.photos(entrant.id), q.moments(race.id)]);
  const byId = new Map(moments.map((m) => [m.id, m]));
  const due = photos.filter((p) => (p.status === 'waiting' || isStale(p, nowMs)) && byId.has(p.momentId));
  const batches = Array.from({ length: Math.ceil(due.length / AT_ONCE) }, (_, i) => due.slice(i * AT_ONCE, (i + 1) * AT_ONCE));
  const made = await batches.reduce<Promise<RunnerPhoto[]>>(
    async (done, batch) => [...(await done), ...(await Promise.all(batch.map((p) => makePhoto(env, deps, race, entrant, byId.get(p.momentId)!, p))))],
    Promise.resolve([]),
  );
  const remade = new Map(made.map((p) => [p.id, p]));
  return photos.map((p) => remade.get(p.id) ?? p);
};

/** Where a picture is served, under `base` (`/<race>/photos` or `/api/me/photos`); its URL names the file, so a new one is a new URL. */
export const picturePath = (base: string, photo: Pick<RunnerPhoto, 'id' | 'resultKey'>): string | null =>
  photo.resultKey ? `${base}/${photo.id}/picture?v=${encodeURIComponent(photo.resultKey.split('/').pop() ?? '')}` : null;

/** A picture from R2: cached publicly once the runner shows it, privately until then. */
export const pictureResponse = (object: R2ObjectBody, shown: boolean): Response =>
  new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': shown ? 'public, max-age=86400' : 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
