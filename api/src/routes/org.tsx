import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { adminDb } from '../db/adminQueries';
import { dashboardDb } from '../db/dashboardQueries';
import { ORG_COOKIE, ORG_SESSION_TTL_MS, requestOrganizerCode, requireAdmin, requireOrganizer, safeNext, signOutOrganizer, verifyOrganizerCode } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { AdminLayout } from '../pages/org/adminLayout';
import { OrgDashboardPage } from '../pages/org/dashboard';
import { OrgRacesPage } from '../pages/org/races';
import { OrgSigninPage } from '../pages/org/signin';
import type { OrgSigninState } from '../pages/org/signin';
import { orgCourses } from './orgCourses';
import { orgPage } from './orgPage';
import { orgRace } from './orgRace';
import { orgRunners } from './orgRunners';
import { orgRuns } from './orgRuns';
import { orgScript } from './orgScript';
import { orgStaff } from './orgStaff';

/**
 * Organizer admin, server-rendered, French. Mounted at /org. One sign-in (/org/signin) opens
 * every race the email belongs to; each race page checks the person's role (lib/orgAuth.ts).
 */
export const org = new Hono<AppEnv & { Variables: OrgVars }>();

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());
const CodeSchema = z.string().trim().regex(/^\d{6}$/);

const signinPage = (state: OrgSigninState, next: string) => (
  <AdminLayout title="Espace organisateur" width="solo">
    <OrgSigninPage state={state} next={next} />
  </AdminLayout>
);

org.get('/signin', (c) => c.html(signinPage({ step: 'identify' }, safeNext(c.req.query('next')))));

org.post('/signin', async (c) => {
  const form = await c.req.parseBody();
  const next = safeNext(form.next);
  const render = (state: OrgSigninState, status: 200 | 400 | 401 | 404 | 429 = 200) => c.html(signinPage(state, next), status);
  const email = EmailSchema.safeParse(form.email);
  if (!email.success) return render({ step: 'identify', error: 'invalid', email: String(form.email ?? '') }, 400);
  if (form.step === 'identify') {
    const result = await requestOrganizerCode(c.env, email.data, (p) => c.executionCtx.waitUntil(p));
    if (!result.ok) {
      const error = result.error === 'too_many_requests' ? 'too_many' : 'unknown';
      return render({ step: 'identify', error, email: email.data }, error === 'too_many' ? 429 : 404);
    }
    return render({ step: 'code', email: email.data, devCode: result.devCode });
  }
  const code = CodeSchema.safeParse(form.code);
  if (!code.success) return render({ step: 'code', email: email.data, error: 'bad_code' }, 400);
  const result = await verifyOrganizerCode(c.env, email.data, code.data);
  if (!result.ok) return render(result.error === 'unknown_organizer' ? { step: 'identify', error: 'unknown', email: email.data } : { step: 'code', email: email.data, error: 'bad_code' }, 401);
  setCookie(c, ORG_COOKIE, result.token, { path: '/org', httpOnly: true, sameSite: 'Lax', secure: c.env.ENVIRONMENT !== 'local', maxAge: ORG_SESSION_TTL_MS / 1000 });
  return c.redirect(next);
});

org.get('/signout', async (c) => {
  const token = getCookie(c, ORG_COOKIE);
  if (token) await signOutOrganizer(c.env, token);
  deleteCookie(c, ORG_COOKIE, { path: '/org' });
  return c.redirect('/org/signin');
});

/** The races of the signed-in person. With exactly one, go straight to it. */
org.get('/', requireAdmin, async (c) => {
  const admin = c.get('admin');
  const races = await adminDb(c.env.DB).racesFor(admin.email, admin.staff);
  const denied = c.req.query('denied') === '1';
  const only = races[0];
  if (races.length === 1 && only && !admin.staff && !denied) return c.redirect(`/org/${only.race.slug}`);
  return c.html(
    <AdminLayout title="Vos courses" email={admin.email} staff={admin.staff} width="wide">
      <OrgRacesPage races={races} staff={admin.staff} denied={denied} />
    </AdminLayout>,
  );
});

// Staff pages and the race areas, before `/:slug` so their paths are not taken for a race.
org.route('/', orgStaff);
org.route('/', orgRunners);
org.route('/', orgRuns);
org.route('/', orgCourses);
org.route('/', orgScript);
org.route('/', orgRace);

// The first admin had a sign-in page per race; its links still work.
org.get('/:slug/signin', (c) => c.redirect(`/org/signin?next=${encodeURIComponent(`/org/${c.req.param('slug')}`)}`, 301));
org.get('/:slug/signout', (c) => c.redirect('/org/signout'));

org.get('/:slug', requireOrganizer, async (c) => {
  const race = c.get('race');
  const q = dashboardDb(c.env.DB);
  const [funnel, distances, recent, setup] = await Promise.all([q.funnel(race.id), q.distances(race.id), q.recentRuns(race.id), q.setup(race.id)]);
  return orgPage(
    c,
    'home',
    'Accueil',
    <OrgDashboardPage race={race} access={c.get('access')} funnel={funnel} distances={distances} recent={recent} setup={setup} denied={c.req.query('denied') === '1'} />,
  );
});
