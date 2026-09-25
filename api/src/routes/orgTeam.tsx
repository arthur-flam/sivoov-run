import { Hono } from 'hono';
import { z } from 'zod';
import { OrgRoleSchema, OrganizerSchema, can, removalProblem, roleChangeProblem } from '@sivoov/shared';
import type { Organizer, Race } from '@sivoov/shared';
import type { AppEnv, Bindings } from '../env';
import { adminDb } from '../db/adminQueries';
import { raceAdminDb } from '../db/raceAdminQueries';
import { newId } from '../lib/crypto';
import { mailerFor } from '../lib/mailer';
import type { Mail } from '../lib/mailer';
import { requireCan, requireOrganizer } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { teamInviteEmail } from '../pages/emails';
import { ROLE_HINTS, ROLE_LABELS } from '../pages/org/format';
import type { FormState } from '../pages/org/settingsFields';
import { OrgTeamPage, TEAM_DONE, TEAM_PROBLEMS } from '../pages/org/team';
import { doneMessage, orgPage } from './orgPage';
import type { OrgContext } from './orgPage';

/** The race's team: invite, change a role, remove. Owners and staff only (`manage_team`). */
export const orgTeam = new Hono<AppEnv & { Variables: OrgVars }>();

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z
    .string()
    .trim()
    .max(80)
    .transform((v) => v || undefined),
  role: OrgRoleSchema,
});

const INVITE_ERRORS: Record<string, string> = {
  email: 'Cette adresse email ne semble pas valide.',
  name: 'Ce nom est trop long : 80 caractères au plus.',
  role: 'Choisissez un rôle.',
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

type TeamState = { problem?: string; invite?: FormState };

const teamPage = async (c: OrgContext, state: TeamState = {}, status: 200 | 400 | 409 = 200) => {
  const race = c.get('race');
  const members = await adminDb(c.env.DB).members(race.id);
  const done = doneMessage(c, TEAM_DONE) ? c.req.query('done') : undefined;
  return orgPage(c, 'team', 'Équipe', <OrgTeamPage race={race} access={c.get('access')} members={members} done={done} {...state} />, { status });
};

orgTeam.get('/:slug/team', requireOrganizer, requireCan('manage_team'), (c) => teamPage(c));

/** The invitation email, from someone on the team (by their name when they gave one) or from staff. */
export const inviteMail = (env: Bindings, race: Race, member: Organizer, inviter: string): Mail =>
  teamInviteEmail({
    to: member.email,
    name: member.name,
    inviter,
    race,
    roleLabel: ROLE_LABELS[member.role],
    roleHint: ROLE_HINTS[member.role],
    signinUrl: `${env.BASE_URL.replace(/\/+$/, '')}/org/signin`,
  });

/** Invite someone, or re-invite a member: the role is updated, the row is not duplicated, one email goes out. */
orgTeam.post('/:slug/team/invite', requireOrganizer, requireCan('manage_team'), async (c) => {
  const race = c.get('race');
  const admin = c.get('admin');
  const form = await c.req.parseBody();
  const values = { email: text(form.email), name: text(form.name), role: text(form.role) };
  const parsed = InviteSchema.safeParse(values);
  if (!parsed.success) {
    const errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), INVITE_ERRORS[String(i.path[0])] ?? 'Valeur invalide.']));
    return teamPage(c, { invite: { values, errors } }, 400);
  }
  const members = await adminDb(c.env.DB).members(race.id);
  const existing = members.find((m) => m.email === parsed.data.email);
  const problem = existing ? roleChangeProblem(members, existing.email, parsed.data.role) : null;
  if (problem) return teamPage(c, { problem: TEAM_PROBLEMS[problem], invite: { values, errors: {} } }, 409);
  const member = OrganizerSchema.parse({
    id: existing?.id ?? newId(),
    raceId: race.id,
    email: parsed.data.email,
    role: parsed.data.role,
    name: parsed.data.name,
    invitedBy: admin.email,
    createdAt: new Date().toISOString(),
  });
  await adminDb(c.env.DB).upsertOrganizer(member);
  const inviter = members.find((m) => m.email === admin.email)?.name ?? admin.email;
  c.executionCtx.waitUntil(mailerFor(c.env).send(inviteMail(c.env, race, { ...member, name: member.name ?? existing?.name }, inviter)));
  return c.redirect(`/org/${race.slug}/team?done=${existing ? 'reinvited' : 'invited'}`);
});

/** A new role for a member. The last owner keeps theirs; someone who demotes themself leaves this page. */
orgTeam.post('/:slug/team/role', requireOrganizer, requireCan('manage_team'), async (c) => {
  const race = c.get('race');
  const access = c.get('access');
  const form = await c.req.parseBody();
  const email = text(form.email).toLowerCase();
  const role = OrgRoleSchema.safeParse(form.role);
  if (!role.success) return teamPage(c, { problem: INVITE_ERRORS.role }, 400);
  const members = await adminDb(c.env.DB).members(race.id);
  const problem = roleChangeProblem(members, email, role.data);
  if (problem) return teamPage(c, { problem: TEAM_PROBLEMS[problem] }, 409);
  if (!(await raceAdminDb(c.env.DB).setRole(race.id, email, role.data))) return teamPage(c, { problem: TEAM_PROBLEMS.last_owner }, 409);
  const self = email === access.email;
  return c.redirect(self && !can({ ...access, role: role.data }, 'manage_team') ? `/org/${race.slug}` : `/org/${race.slug}/team?done=role`);
});

/** Remove a member (never the last owner). Someone who removes themself goes back to their races. */
orgTeam.post('/:slug/team/remove', requireOrganizer, requireCan('manage_team'), async (c) => {
  const race = c.get('race');
  const access = c.get('access');
  const email = text((await c.req.parseBody()).email).toLowerCase();
  const members = await adminDb(c.env.DB).members(race.id);
  const problem = removalProblem(members, email);
  if (problem) return teamPage(c, { problem: TEAM_PROBLEMS[problem] }, 409);
  if (!(await raceAdminDb(c.env.DB).removeMember(race.id, email))) return teamPage(c, { problem: TEAM_PROBLEMS.last_owner }, 409);
  return c.redirect(email === access.email && !access.staff ? '/org' : `/org/${race.slug}/team?done=removed`);
});
