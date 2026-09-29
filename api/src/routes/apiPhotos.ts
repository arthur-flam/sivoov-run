import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { canTryAgain, courseMoments } from '@sivoov/shared';
import type { RunnerPhoto } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { photoQueries } from '../db/photoQueries';
import type { AuthVars } from '../lib/auth';
import { makePhoto, makeWaiting, remixDeps, remixEnabled, storeSelfie } from '../lib/photos';

/**
 * The app's side of the race photos, on the runner's bearer session (mounted under `/api`,
 * behind `requireEntrant` for `/me/*`). The app sends the runner's photos whenever it has them
 * (a selfie on the line, the ones picked after the run), and asks for the pictures once the run
 * is over: one flow, no waiting during the race.
 */
export const apiPhotos = new Hono<AppEnv & { Variables: AuthVars }>();

type Ctx = Context<AppEnv & { Variables: AuthVars }>;

/** What the app gets of a photo: never the R2 keys. */
const view = (p: RunnerPhoto) => ({
  id: p.id,
  momentId: p.momentId,
  status: p.status,
  attempts: p.attempts,
  again: canTryAgain(p),
  shown: p.shown,
  picture: p.resultKey ? `/api/me/photos/${p.id}/picture?v=${encodeURIComponent(p.resultKey.split('/').pop() ?? '')}` : null,
});

const context = async (c: Ctx) => {
  const entrant = c.get('entrant')!;
  const q = db(c.env.DB);
  const [race, course] = await Promise.all([q.raceById(entrant.raceId), q.courseFor(entrant.raceId, entrant.distanceKey)]);
  return race && course ? { entrant, race, course } : null;
};

apiPhotos.get('/me/photos', async (c) => {
  const ctx = await context(c);
  if (!ctx) return c.json({ error: 'not_found' }, 404);
  const pq = photoQueries(c.env.DB);
  const [moments, photos] = await Promise.all([pq.moments(ctx.race.id), pq.photos(ctx.entrant.id)]);
  return c.json({ enabled: remixEnabled(remixDeps(c.env)), moments: courseMoments(moments, ctx.course), photos: photos.map(view) }, 200, { 'Cache-Control': 'private, no-store' });
});

/** Every photo still waiting gets its picture now (20-40 s each, three at a time). */
apiPhotos.post('/me/photos/render', async (c) => {
  const ctx = await context(c);
  if (!ctx) return c.json({ error: 'not_found' }, 404);
  const deps = remixDeps(c.env);
  if (!remixEnabled(deps)) return c.json({ error: 'unavailable' }, 503);
  const photos = await makeWaiting(c.env, deps, ctx.race, ctx.entrant);
  return c.json({ photos: photos.map(view) }, 200, { 'Cache-Control': 'private, no-store' });
});

/**
 * A photo for a moment, kept waiting for its picture. `consent=on` is the runner's agreement,
 * given in the app before anything is sent.
 */
apiPhotos.post('/me/photos/:momentId', async (c) => {
  const ctx = await context(c);
  if (!ctx) return c.json({ error: 'not_found' }, 404);
  const moment = await photoQueries(c.env.DB).moment(ctx.race.id, c.req.param('momentId'));
  if (!moment || courseMoments([moment], ctx.course).length === 0) return c.json({ error: 'unknown_moment' }, 404);
  const body = await c.req.parseBody();
  if (body.consent !== 'on') return c.json({ error: 'consent' }, 400);
  if (!(body.photo instanceof File) || body.photo.size === 0) return c.json({ error: 'no_file' }, 400);
  const existing = (await photoQueries(c.env.DB).photos(ctx.entrant.id)).find((p) => p.momentId === moment.id);
  if (existing && !canTryAgain(existing)) return c.json({ error: 'no_more' }, 429);
  const stored = await storeSelfie(c.env, ctx.entrant, moment, body.photo, new Date().toISOString());
  if (!stored.ok) return c.json({ error: stored.error }, stored.error === 'too_big' ? 413 : 400);
  return c.json({ photo: view(stored.photo) });
});

/** Another version of a picture, from the same photo. */
apiPhotos.post('/me/photos/:id/again', async (c) => {
  const ctx = await context(c);
  if (!ctx) return c.json({ error: 'not_found' }, 404);
  const pq = photoQueries(c.env.DB);
  const photo = await pq.photo(ctx.entrant.id, c.req.param('id'));
  const moment = photo ? await pq.moment(ctx.race.id, photo.momentId) : null;
  if (!photo || !moment) return c.json({ error: 'not_found' }, 404);
  if (!canTryAgain(photo)) return c.json({ error: 'no_more' }, 429);
  return c.json({ photo: view(await makePhoto(c.env, remixDeps(c.env), ctx.race, ctx.entrant, moment, photo)) });
});

apiPhotos.post('/me/photos/:id/shown', async (c) => {
  const entrant = c.get('entrant')!;
  const pq = photoQueries(c.env.DB);
  const photo = await pq.photo(entrant.id, c.req.param('id'));
  if (!photo) return c.json({ error: 'not_found' }, 404);
  const shown = z.object({ shown: z.boolean() }).safeParse(await c.req.json().catch(() => null));
  if (!shown.success) return c.json({ error: 'invalid' }, 400);
  const next = { ...photo, shown: shown.data.shown, updatedAt: new Date().toISOString() };
  await pq.upsertPhoto(next);
  return c.json({ photo: view(next) });
});

apiPhotos.get('/me/photos/:id/picture', async (c) => {
  const photo = await photoQueries(c.env.DB).photo(c.get('entrant')!.id, c.req.param('id'));
  const object = photo?.resultKey ? await c.env.FILES.get(photo.resultKey) : null;
  if (!object) return c.json({ error: 'not_found' }, 404);
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'image/png', 'Cache-Control': 'private, max-age=86400' } });
});
