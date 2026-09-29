import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { canTryAgain, courseMoments, translator } from '@sivoov/shared';
import type { Course, Entrant, Race } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { photoQueries } from '../db/photoQueries';
import { entrantForToken, startSession } from '../lib/authService';
import { sha256Hex } from '../lib/crypto';
import { sameSitePath } from '../lib/nextPath';
import { REFUSAL_STATUS, acceptSelfie, makePhoto, pictureResponse, picturePath, remixDeps, remixEnabled } from '../lib/photos';
import { mediaUrl } from '../lib/raceMedia';
import { Layout } from '../pages/layout';
import { PhotosPage } from '../pages/photos';
import type { PhotoProblem } from '../pages/photos';
import { localeOf } from './locale';
import { SESSION_COOKIE, setRunnerCookie } from './pages';

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
        photos={mine.map((p) => ({ ...p, url: picturePath(`/${race.slug}/photos`, p) ?? undefined, again: canTryAgain(p, Date.now()) }))}
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
  const accepted = await acceptSelfie(c.env, entrant, course, c.req.param('momentId'), await c.req.parseBody());
  if (!accepted.ok) return page(c, signed, { reason: accepted.reason, momentId: accepted.momentId }, REFUSAL_STATUS[accepted.reason]);
  const made = await makePhoto(c.env, remixDeps(c.env), race, entrant, accepted.moment, accepted.photo);
  if (made.status !== 'done' || made.error) return page(c, signed, { reason: 'failed', momentId: accepted.moment.id }, 422);
  return back(c, race, accepted.moment.id);
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
  if (!canTryAgain(photo, Date.now())) return page(c, signed, { reason: 'no_more', momentId: moment.id }, 429);
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
  return object ? pictureResponse(object, photo.shown) : c.notFound();
});

/** Only the race's own pages: a link can never send the browser elsewhere (`sameSitePath` refuses `//host` and its disguises). */
const safeNext = (race: Race, next: string | undefined): string => {
  const path = sameSitePath(next);
  return path && path.startsWith(`/${race.slug}/`) ? path : `/${race.slug}/photos`;
};

/** The app's one-use link (lib/webLink.ts): the browser gets its own web session, then goes on. */
photos.get('/:slug/link', async (c) => {
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const next = safeNext(race, c.req.query('next'));
  const entrantId = await photoQueries(c.env.DB).useWebLink(await sha256Hex(c.req.query('c') ?? ''), new Date().toISOString());
  const entrant = entrantId ? await q.entrantById(entrantId) : null;
  // A used or old link: the page asks for the email code, then goes on to the same place.
  if (!entrant || entrant.raceId !== race.id) return c.redirect(`/${race.slug}/signin?next=${encodeURIComponent(next)}`);
  setRunnerCookie(c, (await startSession(c.env, entrant.id, 'web')).token);
  return c.redirect(next);
});
