import { Buffer } from 'node:buffer';
import { IMAGE_TYPES, RENDER_STALE_MS, checkImage, remixPrompt, sniffImage, stripJpegMetadata } from '@sivoov/shared';
import type { Entrant, PhotoMoment, Race, RunnerPhoto } from '@sivoov/shared';
import type { Bindings } from '../env';
import { photoQueries } from '../db/photoQueries';
import { newId } from './crypto';

/**
 * Photo moments in the Worker: a runner's photo is stored (private, R2 `selfies/`), then an image
 * model is asked to put them into their race, with the organizer's photos of the place, and the
 * picture is stored (R2 `photos/`). The model is Google's Gemini image model, reached through the
 * AI Gateway like every model call. `fetchImpl` lets the tests stand in for it.
 */

export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

/**
 * `stand-in`: on a local Worker with no key the "picture" is the runner's own photo, so the pages
 * and the screenshots can walk the whole flow. Never on preview or production.
 */
export type RemixDeps = { files: R2Bucket; gemini?: { apiKey: string; gateway: string }; model: string; standIn?: boolean; fetchImpl?: typeof fetch };

export const remixDeps = (env: Bindings): RemixDeps => ({
  files: env.FILES,
  model: env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
  standIn: env.ENVIRONMENT === 'local' && !env.GEMINI_API_KEY,
  ...(env.GEMINI_API_KEY && env.CF_ACCOUNT_ID && env.AI_GATEWAY
    ? { gemini: { apiKey: env.GEMINI_API_KEY, gateway: `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY}` } }
    : {}),
});

export const remixEnabled = (deps: Pick<RemixDeps, 'gemini' | 'standIn'>): boolean => Boolean(deps.gemini || deps.standIn);

type Picture = { bytes: Uint8Array; contentType: string };
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

export type StoredSelfie = { ok: true; photo: RunnerPhoto } | { ok: false; error: 'empty' | 'type' | 'too_big' };

/**
 * The runner's photo for a moment, stored privately, `waiting` for its picture (made right
 * after on the web, after the run from the app). A photo sent again for the same moment
 * replaces the first, and its picture is made again: the tries left carry over.
 */
export const storeSelfie = async (env: Bindings, entrant: Entrant, moment: PhotoMoment, file: File, nowIso: string): Promise<StoredSelfie> => {
  const sent = new Uint8Array(await file.arrayBuffer());
  const check = checkImage(sent, 'selfie');
  if (!check.ok) return check;
  // The page drops the EXIF when it shrinks the photo; without the page's script it is done here.
  const bytes = stripJpegMetadata(sent);
  const q = photoQueries(env.DB);
  const existing = (await q.photos(entrant.id)).find((p) => p.momentId === moment.id);
  const id = existing?.id ?? newId();
  const selfieKey = `selfies/${entrant.raceId}/${entrant.id}/${id}.${IMAGE_TYPES[check.kind].ext}`;
  await env.FILES.put(selfieKey, bytes, { httpMetadata: { contentType: IMAGE_TYPES[check.kind].contentType } });
  if (existing && existing.selfieKey !== selfieKey) await env.FILES.delete(existing.selfieKey);
  const photo: RunnerPhoto = {
    id,
    entrantId: entrant.id,
    momentId: moment.id,
    selfieKey,
    status: 'waiting',
    resultKey: existing?.resultKey,
    error: undefined,
    attempts: existing?.attempts ?? 0,
    shown: existing?.shown ?? false,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  await q.upsertPhoto(photo);
  return { ok: true, photo };
};

/**
 * Makes the picture for a photo, once at a time (`claimRender`): the runner's photo, the place's
 * photos, the prompt, the model, then the picture in R2. A failure keeps the previous picture,
 * if any, and says why for the organizer. Returns the photo as it now stands.
 */
export const makePhoto = async (env: Bindings, deps: RemixDeps, race: Race, entrant: Entrant, moment: PhotoMoment, photo: RunnerPhoto, nowMs = Date.now()): Promise<RunnerPhoto> => {
  const q = photoQueries(env.DB);
  const nowIso = new Date(nowMs).toISOString();
  const claimed = await q.claimRender(photo.id, nowIso, new Date(nowMs - RENDER_STALE_MS).toISOString());
  if (!claimed) return (await q.photo(entrant.id, photo.id)) ?? photo;
  const attempts = photo.attempts + 1;
  const done = (fields: Partial<RunnerPhoto>): Promise<RunnerPhoto> => {
    const next: RunnerPhoto = { ...photo, attempts, updatedAt: new Date().toISOString(), ...fields };
    return q.upsertPhoto(next).then(() => next);
  };
  const selfie = await read(env.FILES, photo.selfieKey);
  if (!selfie) return done({ status: 'failed', error: 'selfie missing' });
  const refs = (await Promise.all(moment.refs.map((key) => read(env.FILES, key)))).filter((p): p is Picture => p !== null);
  const prompt = remixPrompt({ raceName: race.theme.displayName, city: race.city, title: moment.title, scene: moment.scene, bib: entrant.bib, refs: refs.length, finish: moment.at === 'finish' });
  const rendered = await renderRemix(deps, prompt, selfie, refs);
  if (!rendered.ok) {
    console.error('photo render failed', photo.id, rendered.reason, rendered.detail);
    return done({ status: photo.resultKey ? 'done' : 'failed', error: `${rendered.reason}: ${rendered.detail}` });
  }
  const ext = rendered.picture.contentType === 'image/png' ? 'png' : rendered.picture.contentType === 'image/webp' ? 'webp' : 'jpg';
  const resultKey = `photos/${entrant.raceId}/${entrant.id}/${photo.id}-${attempts}.${ext}`;
  await env.FILES.put(resultKey, rendered.picture.bytes, { httpMetadata: { contentType: rendered.picture.contentType } });
  if (photo.resultKey && photo.resultKey !== resultKey) await env.FILES.delete(photo.resultKey);
  return done({ status: 'done', resultKey, error: undefined });
};

/** How many pictures one runner's request makes at once: a Worker holds six connections, R2 included. */
const AT_ONCE = 3;

/**
 * After the run: every photo still waiting gets its picture, three at a time. The app calls it
 * from the finish screen and the finisher's home; a photo already being made is left to finish.
 */
export const makeWaiting = async (env: Bindings, deps: RemixDeps, race: Race, entrant: Entrant): Promise<RunnerPhoto[]> => {
  const q = photoQueries(env.DB);
  const [photos, moments] = await Promise.all([q.photos(entrant.id), q.moments(race.id)]);
  const byId = new Map(moments.map((m) => [m.id, m]));
  const waiting = photos.filter((p) => p.status === 'waiting' && byId.has(p.momentId));
  const batches = Array.from({ length: Math.ceil(waiting.length / AT_ONCE) }, (_, i) => waiting.slice(i * AT_ONCE, (i + 1) * AT_ONCE));
  const made = await batches.reduce<Promise<RunnerPhoto[]>>(
    async (done, batch) => [...(await done), ...(await Promise.all(batch.map((p) => makePhoto(env, deps, race, entrant, byId.get(p.momentId)!, p))))],
    Promise.resolve([]),
  );
  const remade = new Map(made.map((p) => [p.id, p]));
  return photos.map((p) => remade.get(p.id) ?? p);
};
