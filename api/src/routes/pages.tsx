import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { CodeRequestSchema, CodeVerifySchema, buildTrack, deauvilleMarathonGeometry, localeFromHeader, resolveLocale } from '@sivoov/shared';
import type { Course, CourseTrack, Locale } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { Layout } from '../pages/layout';
import { HomePage } from '../pages/home';
import { LandingPage } from '../pages/landing';
import { SigninPage } from '../pages/signin';
import { InstallPage } from '../pages/install';
import { ResultsPage } from '../pages/results';
import { CourseGeometrySchema } from '@sivoov/shared';
import { entrantForToken, requestCode, signOut, verifyCode } from '../lib/authService';

export const pages = new Hono<AppEnv>();

const SESSION_COOKIE = 'sivoov_session';

/** ?lang= wins and is remembered; then the cookie; then Accept-Language; French by default. */
const localeOf = (c: Context<AppEnv>): Locale => {
  const fromQuery = c.req.query('lang');
  if (fromQuery) {
    const l = resolveLocale(fromQuery);
    setCookie(c, 'lang', l, { path: '/', maxAge: 365 * 86400, sameSite: 'Lax' });
    return l;
  }
  const fromCookie = getCookie(c, 'lang');
  return fromCookie ? resolveLocale(fromCookie) : localeFromHeader(c.req.header('Accept-Language'));
};

const trackFor = async (env: AppEnv['Bindings'], course: Course | undefined): Promise<CourseTrack | null> => {
  if (!course) return null;
  const object = course.geometryKey ? await env.FILES.get(course.geometryKey) : null;
  const geometry = object ? CourseGeometrySchema.parse(await object.json()) : deauvilleMarathonGeometry;
  return buildTrack(geometry.points);
};

pages.get('/', async (c) => {
  const locale = localeOf(c);
  const races = await db(c.env.DB).races();
  return c.html(
    <Layout title="Sivoov Run" locale={locale} path="/">
      <HomePage races={races} locale={locale} />
    </Layout>,
  );
});

pages.get('/:slug', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const courses = await q.coursesForRace(race.id);
  const track = await trackFor(c.env, courses[0]);
  const mapUrl = c.env.MAPBOX_TOKEN && courses[0] ? `/api/courses/${courses[0].id}/map.png` : null;
  return c.html(
    <Layout title={`${race.theme.displayName} · Sivoov Run`} description={race.name} locale={locale} race={race} path={`/${race.slug}`}>
      <LandingPage race={race} courses={courses} track={track} mapUrl={mapUrl} locale={locale} />
    </Layout>,
  );
});

pages.get('/:slug/signin', async (c) => {
  const locale = localeOf(c);
  const race = await db(c.env.DB).raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  return c.html(
    <Layout title={`${locale === 'fr' ? 'Identifiez-vous' : 'Sign in'} · ${race.theme.displayName}`} locale={locale} race={race} path={`/${race.slug}/signin`}>
      <SigninPage race={race} locale={locale} state={{ step: 'identify' }} />
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
  const render = (state: Parameters<typeof SigninPage>[0]['state'], status: 200 | 400 | 401 | 404 | 429 = 200) =>
    c.html(
      <Layout title={`${locale === 'fr' ? 'Identifiez-vous' : 'Sign in'} · ${race.theme.displayName}`} locale={locale} race={race} path={`/${race.slug}/signin`}>
        <SigninPage race={race} locale={locale} state={state} />
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
  return c.redirect(`/${race.slug}/app`);
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

pages.get('/:slug/results', async (c) => {
  const locale = localeOf(c);
  const q = db(c.env.DB);
  const race = await q.raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const courses = await q.coursesForRace(race.id);
  const course = courses.find((x) => x.distanceKey === c.req.query('distance')) ?? courses[0];
  if (!course) return c.notFound();
  const rows = await q.resultsForCourse(course.id);
  return c.html(
    <Layout title={`${locale === 'fr' ? 'Résultats' : 'Results'} · ${race.theme.displayName}`} locale={locale} race={race} path={`/${race.slug}/results`}>
      <ResultsPage race={race} course={course} courses={courses} rows={rows} locale={locale} />
    </Layout>,
  );
});
