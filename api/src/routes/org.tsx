import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { formatOfficialTime, parseEntrantsCsv, toCsv } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { orgDb } from '../db/orgQueries';
import { ORG_COOKIE, ORG_SESSION_TTL_MS, requestOrganizerCode, requireOrganizer, signOutOrganizer, verifyOrganizerCode } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { Layout } from '../pages/layout';
import { OrgSigninPage } from '../pages/org/signin';
import type { OrgSigninState } from '../pages/org/signin';
import { OrgHomePage } from '../pages/org/home';
import { OrgImportPage } from '../pages/org/import';
import type { ImportOutcome } from '../pages/org/import';

/** Organizer admin, server-rendered, French. Mounted at /org. */
export const org = new Hono<AppEnv & { Variables: OrgVars }>();

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());
const CodeSchema = z.string().trim().regex(/^\d{6}$/);

org.get('/:slug/signin', async (c) => {
  const race = await db(c.env.DB).raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  return c.html(
    <Layout title={`Organisateur · ${race.theme.displayName}`} locale="fr" race={race} path={`/org/${race.slug}/signin`}>
      <OrgSigninPage race={race} state={{ step: 'identify' }} />
    </Layout>,
  );
});

org.post('/:slug/signin', async (c) => {
  const race = await db(c.env.DB).raceBySlug(c.req.param('slug'));
  if (!race) return c.notFound();
  const form = await c.req.parseBody();
  const render = (state: OrgSigninState, status: 200 | 400 | 401 | 404 | 429 = 200) =>
    c.html(
      <Layout title={`Organisateur · ${race.theme.displayName}`} locale="fr" race={race} path={`/org/${race.slug}/signin`}>
        <OrgSigninPage race={race} state={state} />
      </Layout>,
      status,
    );
  const email = EmailSchema.safeParse(form.email);
  if (!email.success) return render({ step: 'identify', error: 'invalid', email: String(form.email ?? '') }, 400);
  if (form.step === 'identify') {
    const result = await requestOrganizerCode(c.env, race, email.data, (p) => c.executionCtx.waitUntil(p));
    if (!result.ok) {
      const error = result.error === 'too_many_requests' ? 'too_many' : 'unknown';
      return render({ step: 'identify', error, email: email.data }, error === 'too_many' ? 429 : 404);
    }
    return render({ step: 'code', email: email.data, devCode: result.devCode });
  }
  const code = CodeSchema.safeParse(form.code);
  if (!code.success) return render({ step: 'code', email: email.data, error: 'bad_code' }, 400);
  const result = await verifyOrganizerCode(c.env, race, email.data, code.data);
  if (!result.ok) return render({ step: 'code', email: email.data, error: 'bad_code' }, 401);
  setCookie(c, ORG_COOKIE, result.token, { path: '/org', httpOnly: true, sameSite: 'Lax', secure: c.env.ENVIRONMENT !== 'local', maxAge: ORG_SESSION_TTL_MS / 1000 });
  return c.redirect(`/org/${race.slug}`);
});

org.get('/:slug/signout', async (c) => {
  const token = getCookie(c, ORG_COOKIE);
  if (token) await signOutOrganizer(c.env, token);
  deleteCookie(c, ORG_COOKIE, { path: '/org' });
  return c.redirect(`/org/${c.req.param('slug')}/signin`);
});

org.get('/:slug', requireOrganizer, async (c) => {
  const race = c.get('race');
  const q = orgDb(c.env.DB);
  const search = c.req.query('q') ?? '';
  const [counts, rows] = await Promise.all([q.courseCounts(race.id), q.entrantsWithBest(race.id, search)]);
  return c.html(
    <Layout title={`Inscrits · ${race.theme.displayName}`} locale="fr" race={race} path={`/org/${race.slug}`}>
      <OrgHomePage race={race} organizer={c.get('organizer')} counts={counts} rows={rows} search={search} />
    </Layout>,
  );
});

type OrgContext = Context<AppEnv & { Variables: OrgVars }>;

const importPage = (c: OrgContext, outcome?: ImportOutcome) => {
  const race = c.get('race');
  return c.html(
    <Layout title={`Import · ${race.theme.displayName}`} locale="fr" race={race} path={`/org/${race.slug}/import`}>
      <OrgImportPage race={race} organizer={c.get('organizer')} outcome={outcome} />
    </Layout>,
  );
};

org.get('/:slug/import', requireOrganizer, (c) => importPage(c));

/** Multipart file or a pasted textarea; the parser reports every rejected line, the rest is upserted on (race, bib). */
org.post('/:slug/import', requireOrganizer, async (c) => {
  const form = await c.req.parseBody();
  const text = form.file instanceof File && form.file.size > 0 ? await form.file.text() : String(form.csv ?? '');
  const parsed = parseEntrantsCsv(text);
  const report = await orgDb(c.env.DB).importEntrants(c.get('race').id, parsed.entrants);
  return importPage(c, { ...report, rejected: parsed.rejected });
});

const csvResponse = (c: OrgContext, name: string, text: string) =>
  c.body(text, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });

org.get('/:slug/export/entrants.csv', requireOrganizer, async (c) => {
  const race = c.get('race');
  const rows = await orgDb(c.env.DB).entrantsWithBest(race.id);
  const csv = toCsv([
    ['bib', 'email', 'first_name', 'last_name', 'distance_key', 'best_time'],
    ...rows.map(({ entrant, bestMs }) => [entrant.bib, entrant.email, entrant.firstName, entrant.lastName, entrant.distanceKey, bestMs === null ? '' : formatOfficialTime(bestMs)]),
  ]);
  return csvResponse(c, `${race.slug}-inscrits.csv`, csv);
});

org.get('/:slug/export/results.csv', requireOrganizer, async (c) => {
  const race = c.get('race');
  const rows = await orgDb(c.env.DB).resultRows(race.id);
  const csv = toCsv([
    ['bib', 'name', 'course', 'elapsed', 'elapsed_ms', 'distance_m', 'status', 'finished_at'],
    ...rows.map((r) => [
      r.bib, `${r.firstName} ${r.lastName.toUpperCase()}`, r.distanceKey,
      r.elapsedMs === null ? '' : formatOfficialTime(r.elapsedMs), r.elapsedMs, r.distanceM === null ? '' : Math.round(r.distanceM),
      r.status ?? 'not_started', r.finishedAt,
    ]),
  ]);
  return csvResponse(c, `${race.slug}-resultats.csv`, csv);
});
