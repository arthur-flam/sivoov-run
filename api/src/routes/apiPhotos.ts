import { Hono } from 'hono';
import type { Context } from 'hono';
import { courseMoments } from '@sivoov/shared';
import type { RunnerPhoto } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { photoQueries } from '../db/photoQueries';
import type { AuthVars } from '../lib/auth';
import { REFUSAL_STATUS, acceptSelfie, makeWaiting, pictureResponse, picturePath, remixDeps, remixEnabled } from '../lib/photos';

/**
 * The app's side of the race photos, on the runner's bearer session (mounted under `/api`,
 * behind `requireEntrant` for `/me/*`). The app sends the runner's photos whenever it has them
 * (the camera during the run, the ones picked after it), and asks for the pictures once the run
 * is over. Showing a picture on the result page, another version, deleting: the web page, which
 * the app opens signed in.
 */
export const apiPhotos = new Hono<AppEnv & { Variables: AuthVars }>();

type Ctx = Context<AppEnv & { Variables: AuthVars }>;

/** What the app gets of a photo: never the R2 keys. */
const view = (p: RunnerPhoto) => ({ id: p.id, momentId: p.momentId, status: p.status, picture: picturePath('/api/me/photos', p) });

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
  return c.json({ photos: (await makeWaiting(c.env, deps, ctx.race, ctx.entrant)).map(view) }, 200, { 'Cache-Control': 'private, no-store' });
});

/** A photo for a moment, kept waiting for its picture. `consent=on`: the runner agreed in the app before anything was sent. */
apiPhotos.post('/me/photos/:momentId', async (c) => {
  const ctx = await context(c);
  if (!ctx) return c.json({ error: 'not_found' }, 404);
  const accepted = await acceptSelfie(c.env, ctx.entrant, ctx.course, c.req.param('momentId'), await c.req.parseBody());
  return accepted.ok ? c.json({ photo: view(accepted.photo) }) : c.json({ error: accepted.reason }, REFUSAL_STATUS[accepted.reason]);
});

apiPhotos.get('/me/photos/:id/picture', async (c) => {
  const photo = await photoQueries(c.env.DB).photo(c.get('entrant')!.id, c.req.param('id'));
  const object = photo?.resultKey ? await c.env.FILES.get(photo.resultKey) : null;
  return object ? pictureResponse(object, false) : c.json({ error: 'not_found' }, 404);
});
