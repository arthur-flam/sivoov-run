import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { CodeRequestSchema, CodeVerifySchema, buildTrack, t, translator } from '@sivoov/shared';
import type { Course, CourseTrack } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { Layout } from '../pages/layout';
import type { OpenGraph } from '../pages/layout';
import { previewImage } from '../lib/cards';
import { HomePage } from '../pages/home';
import { LandingPage } from '../pages/landing';
import { SigninPage } from '../pages/signin';
import { InstallPage } from '../pages/install';
import { CourseGeometrySchema } from '@sivoov/shared';
import { entrantForToken, requestCode, signOut, verifyCode } from '../lib/authService';
import { sameSitePath } from '../lib/nextPath';
import { localeOf } from './locale';

export const pages = new Hono<AppEnv>();

export const SESSION_COOKIE = 'sivoov_session';

/** The course line when the race has one; a new race shows no course until its GPX is in, never another race's. */
export const trackFor = async (env: AppEnv['Bindings'], course: Course | undefined): Promise<CourseTrack | null> => {
  const object = course?.geometryKey ? await env.FILES.get(course.geometryKey) : null;
  return object ? buildTrack(CourseGeometrySchema.parse(await object.json()).points) : null;
};

/** The Mapbox picture of a course, when the Worker has a token to draw it (else the SVG diagram). */
const mapUrlFor = (env: AppEnv['Bindings'], course: Course | undefined, size = ''): string | null =>
  env.MAPBOX_TOKEN && course?.geometryKey ? `/api/courses/${course.id}/map.png${size}` : null;

pages.get('/', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const races = await q.races();
  const cards = await Promise.all(
    races.map(async (race) => {
      const courses = await q.coursesForRace(race.id);
      const mapUrl = mapUrlFor(c.env, courses[0], '?w=720&h=480');
      return { race, courses, mapUrl, track: mapUrl ? null : await trackFor(c.env, courses[0]) };
    }),
  );
  return c.html(
    <Layout title="Sivoov Run" description={t(locale, 'site.home.title')} locale={locale} path="/">
      <HomePage cards={cards} locale={locale} />
    </Layout>,
  );
});

pages.get('/:slug', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const courses = await q.coursesForRace(race.id);
  const mapUrl = mapUrlFor(c.env, courses[0]);
  const track = mapUrl ? null : await trackFor(c.env, courses[0]);
  const base = new URL(c.req.url).origin;
  const og: OpenGraph = {
    title: translator(locale)('landing.tagline', { race: race.theme.displayName }),
    description: translator(locale)('landing.lede'),
    url: `${base}/${race.slug}`,
    image: previewImage(c.env, `${base}/${race.slug}/og.png?lang=${locale}`, courses[0], base),
  };
  return c.html(
    <Layout title={`${race.theme.displayName} · Sivoov Run`} description={race.name} locale={locale} race={race} path={`/${race.slug}`} og={og}>
      <LandingPage race={race} courses={courses} track={track} mapUrl={mapUrl} locale={locale} now={Date.now()} />
    </Layout>,
  );
});

pages.get('/:slug/signin', async (c) => {
  const locale = localeOf(c);
  const race = await db(c.env.DB).raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  return c.html(
    <Layout title={`${locale === 'fr' ? 'Identifiez-vous' : 'Sign in'} · ${race.theme.displayName}`} locale={locale} race={race} path={`/${race.slug}/signin`}>
      <SigninPage race={race} locale={locale} state={{ step: 'identify' }} next={sameSitePath(c.req.query('next'))} />
    </Layout>,
  );
});

/** Progressive: plain form posts, the API does the work, the page re-renders with the next step. */
pages.post('/:slug/signin', async (c) => {
  const locale = localeOf(c);
  const race = await db(c.env.DB).raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const form = await c.req.parseBody();
  const raceSlug = race.slug;
  const next = sameSitePath(form.next);
  const render = (state: Parameters<typeof SigninPage>[0]['state'], status: 200 | 400 | 401 | 404 | 429 = 200) =>
    c.html(
      <Layout title={`${locale === 'fr' ? 'Identifiez-vous' : 'Sign in'} · ${race.theme.displayName}`} locale={locale} race={race} path={`/${race.slug}/signin`}>
        <SigninPage race={race} locale={locale} state={state} next={next} />
      </Layout>,
      status,
    );
  if (form.step === 'identify') {
    const parsed = CodeRequestSchema.safeParse({ raceSlug, bib: form.bib, email: form.email });
    if (!parsed.success) return render({ step: 'identify', error: 'invalid', bib: String(form.bib ?? ''), email: String(form.email ?? '') }, 400);
    const result = await requestCode(c.env, parsed.data, (p) => c.executionCtx.waitUntil(p));
    if (!result.ok) {
      const error = result.error === 'too_many_requests' ? 'too_many' : 'unknown';
      return render({ step: 'identify', error, bib: parsed.data.bib, email: parsed.data.email }, error === 'too_many' ? 429 : 404);
    }
    return render({ step: 'code', bib: parsed.data.bib, email: parsed.data.email, devCode: result.devCode });
  }

  const parsed = CodeVerifySchema.safeParse({ raceSlug, bib: form.bib, email: form.email, code: form.code });
  if (!parsed.success) return render({ step: 'code', bib: String(form.bib ?? ''), email: String(form.email ?? ''), error: 'bad_code' }, 400);
  const result = await verifyCode(c.env, parsed.data);
  if (!result.ok) return render({ step: 'code', bib: parsed.data.bib, email: parsed.data.email, error: 'bad_code' }, 401);
  setCookie(c, SESSION_COOKIE, result.token, { path: '/', httpOnly: true, sameSite: 'Lax', secure: c.env.ENVIRONMENT !== 'local', maxAge: 180 * 86400 });
  return c.redirect(next ?? `/${race.slug}/app`);
});

pages.get('/:slug/app', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const token = getCookie(c, SESSION_COOKIE);
  const entrant = token ? await entrantForToken(c.env, token) : null;
  if (!entrant || entrant.raceId !== race.id) return c.redirect(`/${race.slug}/signin`);
  return c.html(
    <Layout title={`${race.theme.displayName} · Sivoov Run`} locale={locale} race={race} path={`/${race.slug}/app`}>
      <InstallPage race={race} entrant={entrant} locale={locale} />
    </Layout>,
  );
});

pages.get('/:slug/signout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await signOut(c.env, token);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.redirect(`/${c.req.param('slug')}`);
});
