import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { Child } from 'hono/jsx';
import type { AppEnv } from '../env';
import { raceAdminDb } from '../db/raceAdminQueries';
import { mailerFor } from '../lib/mailer';
import { parseNewRace } from '../lib/newRace';
import type { NewRaceForm } from '../lib/newRace';
import { requireAdmin } from '../lib/orgAuth';
import type { AdminVars } from '../lib/orgAuth';
import { AdminLayout } from '../pages/org/adminLayout';
import { OrgLeadsPage } from '../pages/org/leads';
import type { LeadFilter } from '../pages/org/leads';
import { OrgNewRacePage } from '../pages/org/newRace';
import { inviteMail } from './orgTeam';

/** Sivoov staff pages, outside any race: create a race, read the organizers' requests. Mounted under /org. */
export const orgStaff = new Hono<AppEnv & { Variables: AdminVars }>();

type StaffContext = Context<AppEnv & { Variables: AdminVars }>;

const requireStaff = createMiddleware<AppEnv & { Variables: AdminVars }>(async (c, next) => (c.get('admin').staff ? next() : c.redirect('/org?denied=1')));

const staffPage = (c: StaffContext, title: string, body: Child, status: 200 | 400 | 409 = 200) =>
  c.html(
    <AdminLayout title={title} email={c.get('admin').email} staff>
      {body}
    </AdminLayout>,
    status,
  );

const newRacePage = (c: StaffContext, form?: NewRaceForm) =>
  staffPage(c, 'Nouvelle course', <OrgNewRacePage form={form} host={new URL(c.env.BASE_URL).host} />, form ? 400 : 200);

orgStaff.get('/new', requireAdmin, requireStaff, (c) => newRacePage(c));

/** A new race: draft, its courses at the official distances, its first owner invited by email. */
orgStaff.post('/new', requireAdmin, requireStaff, async (c) => {
  const admin = c.get('admin');
  const q = raceAdminDb(c.env.DB);
  const outcome = parseNewRace(await c.req.parseBody({ all: true }), await q.takenSlugs(), admin.email);
  if (!outcome.ok) return newRacePage(c, outcome);
  await q.createRace(outcome.race, outcome.courses, outcome.owner);
  c.executionCtx.waitUntil(mailerFor(c.env).send(inviteMail(c.env, outcome.race, outcome.owner, 'L’équipe Sivoov Run')));
  return c.redirect(`/org/${outcome.race.slug}`);
});

const FILTERS: readonly LeadFilter[] = ['open', 'handled', 'all'];

orgStaff.get('/leads', requireAdmin, requireStaff, async (c) => {
  const show = c.req.query('show');
  const filter = FILTERS.find((f) => f === show) ?? 'open';
  const leads = await raceAdminDb(c.env.DB).leads();
  return staffPage(c, 'Demandes reçues', <OrgLeadsPage leads={leads} filter={filter} done={c.req.query('done')} />);
});

/** "Marquer comme traité" and "Rouvrir" (two routes: see the note on the settings routes in orgRace.tsx). */
(['handled', 'reopen'] as const).forEach((action) =>
  orgStaff.post(`/leads/:id/${action}`, requireAdmin, requireStaff, async (c) => {
    const handled = action === 'handled';
    const found = await raceAdminDb(c.env.DB).setLeadHandled(c.req.param('id'), handled ? new Date().toISOString() : null);
    if (!found) return c.notFound();
    return c.redirect(`/org/leads?done=${handled ? 'handled' : 'reopened'}`);
  }),
);
