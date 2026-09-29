import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { canTryAgain, courseMoments, translator } from '@sivoov/shared';
import type { Course, Entrant, Race } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { photoQueries } from '../db/photoQueries';
import { SESSION_TTL_MS, entrantForToken } from '../lib/authService';
import { newId, randomHex, sha256Hex } from '../lib/crypto';
import { makePhoto, remixDeps, remixEnabled, storeSelfie } from '../lib/photos';
import { mediaUrl } from '../lib/raceMedia';
import { Layout } from '../pages/layout';
import { PhotosPage } from '../pages/photos';
import type { PhotoProblem } from '../pages/photos';
import { localeOf } from './locale';
import { SESSION_COOKIE } from './pages';

/**
 * A runner's race photos, `/{race}/photos`, behind the web session: a selfie per photo moment,
 * put into the race by the image model, private until the runner shows it on their page. The
 * pictures themselves are served from here, never from `/media`.
 */
export const photos = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;
type Signed = { race: Race; entrant: Entrant; course: Course };

const signedIn = async (c: Ctx, next = 'photos'): Promise<Signed | Response> => {
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug') ?? '');
  if (!race) return c.notFound();
  const token = getCookie(c, SESSION_COOKIE);
  const entrant = token ? await entrantForToken(c.env, token) : null;
  if (!entrant || entrant.raceId !== race.id) return c.redirect(`/${race.slug}/signin?next=${encodeURIComponent(`/${race.slug}/${next}`)}`);
  const course = await q.courseFor(race.id, entrant.distanceKey);
  return course ? { race, entrant, course } : c.notFound();
};

const pictureUrl = (race: Race, photoId: string, key: string | undefined): string | undefined =>
  key ? `/${race.slug}/photos/${photoId}/picture?v=${encodeURIComponent(key.split('/').pop() ?? '')}` : undefined;

const page = async (c: Ctx, { race, entrant, course }: Signed, problem?: PhotoProblem, status: 200 | 400 | 404 | 413 | 422 | 429 = 200) => {
  const locale = localeOf(c);
  const q = photoQueries(c.env.DB);
  const [moments, mine] = await Promise.all([q.moments(race.id), q.photos(entrant.id)]);
  const onCourse = courseMoments(moments, course);
  const refs = new Map(moments.map((m) => [m.id, m.refs[0] ? mediaUrl(c.env.BASE_URL, m.refs[0]) : undefined]));
  return c.html(
    <Layout title={`${translator(locale)('photos.title')} · ${race.theme.displayName}`} locale={locale} race={race} path={`/${race.slug}/photos`}>
      <PhotosPage
        race={race}
        entrant={entrant}
        officialM={course.distanceM}
        locale={locale}
        enabled={remixEnabled(remixDeps(c.env))}
        moments={onCourse.map((m) => ({ ...m, place: refs.get(m.id) }))}
        photos={mine.map((p) => ({ ...p, url: pictureUrl(race, p.id, p.resultKey), again: canTryAgain(p) }))}
        problem={problem}
      />
    </Layout>,
    status,
  );
};

photos.get('/:slug/photos', async (c) => {
  const signed = await signedIn(c);
  return signed instanceof Response ? signed : page(c, signed);
});

/** Back to the page, at the moment just touched. */
const back = (c: Ctx, race: Race, momentId: string) => c.redirect(`/${race.slug}/photos#m-${momentId}`, 303);

/**
 * A selfie for a moment: stored, then the picture is made while the page waits (twenty seconds
 * or so; the page says so). The runner agreed on the form to the photo being sent to the model.
 */
photos.post('/:slug/photos/:momentId', async (c) => {
  const signed = await signedIn(c);
  if (signed instanceof Response) return signed;
  const { race, entrant, course } = signed;
  const moment = await photoQueries(c.env.DB).moment(race.id, c.req.param('momentId'));
  if (!moment || !courseMoments([moment], course).length) return page(c, signed, { reason: 'unknown' }, 404);
  const deps = remixDeps(c.env);
  if (!remixEnabled(deps)) return page(c, signed, { reason: 'unavailable', momentId: moment.id }, 422);
  const body = await c.req.parseBody();
  if (body.consent !== 'on') return page(c, signed, { reason: 'consent', momentId: moment.id }, 400);
  const file = body.photo;
  if (!(file instanceof File) || file.size === 0) return page(c, signed, { reason: 'no_file', momentId: moment.id }, 400);
  const existing = (await photoQueries(c.env.DB).photos(entrant.id)).find((p) => p.momentId === moment.id);
  if (existing && !canTryAgain(existing)) return page(c, signed, { reason: 'no_more', momentId: moment.id }, 429);
  const stored = await storeSelfie(c.env, entrant, moment, file, new Date().toISOString());
  if (!stored.ok) return page(c, signed, { reason: stored.error === 'too_big' ? 'too_big' : 'type', momentId: moment.id }, stored.error === 'too_big' ? 413 : 400);
  const made = await makePhoto(c.env, deps, race, entrant, moment, stored.photo);
  if (made.status !== 'done' || made.error) return page(c, signed, { reason: 'failed', momentId: moment.id }, 422);
  return back(c, race, moment.id);
});

/** The same selfie, a new picture: the model draws differently each time. */
photos.post('/:slug/photos/:id/again', async (c) => {
  const signed = await signedIn(c);
  if (signed instanceof Response) return signed;
  const { race, entrant } = signed;
  const q = photoQueries(c.env.DB);
  const photo = await q.photo(entrant.id, c.req.param('id'));
  const moment = photo ? await q.moment(race.id, photo.momentId) : null;
  if (!photo || !moment) return page(c, signed, { reason: 'unknown' }, 404);
  if (!canTryAgain(photo)) return page(c, signed, { reason: 'no_more', momentId: moment.id }, 429);
  const made = await makePhoto(c.env, remixDeps(c.env), race, entrant, moment, photo);
  if (made.error) return page(c, signed, { reason: 'failed', momentId: moment.id }, 422);
  return back(c, race, moment.id);
});

/** Shown on the runner's public result page, or not (the default). */
photos.post('/:slug/photos/:id/shown', async (c) => {
  const signed = await signedIn(c);
  if (signed instanceof Response) return signed;
  const q = photoQueries(c.env.DB);
  const photo = await q.photo(signed.entrant.id, c.req.param('id'));
  if (!photo) return c.notFound();
  const shown = (await c.req.parseBody()).shown === '1';
  await q.upsertPhoto({ ...photo, shown, updatedAt: new Date().toISOString() });
  return back(c, signed.race, photo.momentId);
});

photos.post('/:slug/photos/:id/delete', async (c) => {
  const signed = await signedIn(c);
  if (signed instanceof Response) return signed;
  const q = photoQueries(c.env.DB);
  const photo = await q.photo(signed.entrant.id, c.req.param('id'));
  if (!photo) return c.notFound();
  await q.deletePhoto(signed.entrant.id, photo.id);
  await c.env.FILES.delete([photo.selfieKey, ...(photo.resultKey ? [photo.resultKey] : [])]);
  return back(c, signed.race, photo.momentId);
});

/**
 * A picture: to its runner always, to everyone once shown on their page. Its URL names the file
 * (`v`), so a new picture is a new URL and the old one may be cached.
 */
photos.get('/:slug/photos/:id/picture', async (c) => {
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  const photo = race ? await photoQueries(c.env.DB).photoById(c.req.param('id')) : null;
  if (!race || !photo?.resultKey) return c.notFound();
  const owner = await (async () => {
    const token = getCookie(c, SESSION_COOKIE);
    const entrant = token ? await entrantForToken(c.env, token) : null;
    return entrant?.id === photo.entrantId;
  })();
  const entrant = await q.entrantById(photo.entrantId);
  if (!entrant || entrant.raceId !== race.id || !(owner || photo.shown)) return c.notFound();
  const object = await c.env.FILES.get(photo.resultKey);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': photo.shown ? 'public, max-age=86400' : 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

/** Only the race's own pages: a link can never send the browser elsewhere. */
const safeNext = (race: Race, next: string | undefined): string => (next && next.startsWith(`/${race.slug}/`) && !next.startsWith('//') ? next : `/${race.slug}/photos`);

photos.get('/:slug/link', async (c) => {
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const next = safeNext(race, c.req.query('next'));
  const entrantId = await photoQueries(c.env.DB).useWebLink(await sha256Hex(c.req.query('c') ?? ''), new Date().toISOString());
  const entrant = entrantId ? await q.entrantById(entrantId) : null;
  // A used or old link: the page asks for the email code, then goes on to the same place.
  if (!entrant || entrant.raceId !== race.id) return c.redirect(`/${race.slug}/signin?next=${encodeURIComponent(next)}`);
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await q.createSession(newId(), entrant.id, await sha256Hex(token), expiresAt, 'web');
  setCookie(c, SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'Lax', secure: c.env.ENVIRONMENT !== 'local', maxAge: 180 * 86400 });
  return c.redirect(next);
});
