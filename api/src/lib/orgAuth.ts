import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { can, parseStaffEmails } from '@sivoov/shared';
import type { Access, Course, OrgAction, Race } from '@sivoov/shared';
import type { AppEnv, Bindings } from '../env';
import { db } from '../db/queries';
import { adminDb } from '../db/adminQueries';
import { newId, randomCode, randomHex, sha256Hex } from './crypto';
import { mailerFor } from './mailer';
import { acceptsTestCode } from './testCode';
import { CODE_TTL_MS, MAX_CODES_PER_HOUR, MAX_CODE_ATTEMPTS } from './authService';
import { adminCodeEmail } from '../pages/emails';

export const ORG_COOKIE = 'org_session';
export const ORG_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The signed-in person, before any race is involved. */
export type AdminUser = { email: string; staff: boolean };
export type AdminVars = { admin: AdminUser; orgTokenHash: string };
/** On a race page: the race, and what this person may do on it (see `can` in shared). */
export type OrgVars = AdminVars & { race: Race; access: Access };
export type CourseVars = OrgVars & { course: Course };

export type OrgCodeResult = { ok: true; devCode?: string } | { ok: false; error: 'unknown_organizer' | 'too_many_requests' };
export type OrgVerifyResult = { ok: true; token: string; expiresAt: string } | { ok: false; error: 'unknown_organizer' | 'bad_code' };

export const isStaff = (env: Pick<Bindings, 'STAFF_EMAILS'>, email: string): boolean => parseStaffEmails(env.STAFF_EMAILS).has(email.trim().toLowerCase());

/**
 * Organizer sign-in mirrors the runner flow (api/src/lib/authService.ts), keyed by email:
 * email -> six-digit code by mail -> cookie session for a month, valid on every race the
 * email belongs to. Only team members and staff get a code.
 */
export const requestOrganizerCode = async (env: Bindings, email: string, defer: (p: Promise<unknown>) => void): Promise<OrgCodeResult> => {
  const q = adminDb(env.DB);
  if (!isStaff(env, email) && !(await q.isMember(email))) return { ok: false, error: 'unknown_organizer' };
  const recent = await q.codesRequestedSince(email, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent >= MAX_CODES_PER_HOUR) return { ok: false, error: 'too_many_requests' };
  const code = randomCode();
  await q.createCode(newId(), email, await sha256Hex(code), new Date(Date.now() + CODE_TTL_MS).toISOString());
  defer(mailerFor(env).send(adminCodeEmail({ to: email, code })));
  return { ok: true, ...(env.ENVIRONMENT === 'local' ? { devCode: code } : {}) };
};

export const verifyOrganizerCode = async (env: Bindings, email: string, code: string): Promise<OrgVerifyResult> => {
  const q = adminDb(env.DB);
  if (!isStaff(env, email) && !(await q.isMember(email))) return { ok: false, error: 'unknown_organizer' };
  const active = await q.activeCode(email);
  if (!acceptsTestCode(env, email, code)) {
    // Count the attempt before comparing, so a burst of parallel guesses cannot outrun the limit.
    if (!active || !(await q.claimAttempt(active.id, MAX_CODE_ATTEMPTS))) return { ok: false, error: 'bad_code' };
    if (active.code_hash !== (await sha256Hex(code))) return { ok: false, error: 'bad_code' };
    if (!(await q.consumeCode(active.id))) return { ok: false, error: 'bad_code' };
  }
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + ORG_SESSION_TTL_MS).toISOString();
  await q.createSession(newId(), email, await sha256Hex(token), expiresAt);
  return { ok: true, token, expiresAt };
};

export const signOutOrganizer = async (env: Bindings, token: string): Promise<void> => adminDb(env.DB).deleteSession(await sha256Hex(token));

/** Where to go after sign-in: only admin paths, so the parameter cannot send anyone elsewhere. */
export const safeNext = (next: unknown): string => (typeof next === 'string' && /^\/org(\/[\w\-/.]*)?$/.test(next) && !next.includes('..') ? next : '/org');

const signInRedirect = (c: Context) => {
  const next = new URL(c.req.url).pathname;
  return c.redirect(next === '/org' ? '/org/signin' : `/org/signin?next=${encodeURIComponent(next)}`);
};

/** Wants JSON back: the studio's fetch calls, not a page. */
const wantsJson = (c: Context): boolean =>
  (c.req.header('Content-Type') ?? '').includes('json') || (c.req.header('Accept') ?? '').includes('application/json') || c.req.method === 'PUT';

/** `org_session` cookie -> the signed-in person, or a redirect to /org/signin. */
export const requireAdmin = createMiddleware<AppEnv & { Variables: AdminVars }>(async (c, next) => {
  const token = getCookie(c, ORG_COOKIE);
  const tokenHash = token ? await sha256Hex(token) : null;
  const email = tokenHash ? await adminDb(c.env.DB).emailForToken(tokenHash) : null;
  if (!email || !tokenHash) return wantsJson(c) ? c.json({ error: 'unauthorized' }, 401) : signInRedirect(c);
  c.set('admin', { email, staff: isStaff(c.env, email) });
  c.set('orgTokenHash', tokenHash);
  await next();
});

/**
 * The signed-in person on one race: a member of its team, or staff. Anyone else gets the
 * "no access" page (403), not a hint that the race exists beyond its public page.
 */
export const requireOrganizer = createMiddleware<AppEnv & { Variables: OrgVars }>(async (c, next) => {
  const race = await db(c.env.DB).raceBySlug(c.req.param('slug') ?? '');
  if (!race) return c.notFound();
  const token = getCookie(c, ORG_COOKIE);
  const tokenHash = token ? await sha256Hex(token) : null;
  const q = adminDb(c.env.DB);
  const email = tokenHash ? await q.emailForToken(tokenHash) : null;
  if (!email || !tokenHash) return wantsJson(c) ? c.json({ error: 'unauthorized' }, 401) : signInRedirect(c);
  const staff = isStaff(c.env, email);
  const member = await q.membership(race.id, email);
  if (!member && !staff) return wantsJson(c) ? c.json({ error: 'forbidden' }, 403) : c.redirect('/org?denied=1');
  c.set('admin', { email, staff });
  c.set('orgTokenHash', tokenHash);
  c.set('race', race);
  c.set('access', { email, staff, role: member?.role ?? null });
  await next();
});

/** Guards one action (see ORG_ACTIONS). Always after `requireOrganizer`. */
export const requireCan = (action: OrgAction) =>
  createMiddleware<AppEnv & { Variables: OrgVars }>(async (c, next) => {
    if (can(c.get('access'), action)) return next();
    if (wantsJson(c)) return c.json({ error: 'forbidden', detail: 'Votre rôle ne permet pas cette action.' }, 403);
    return c.redirect(`/org/${c.get('race').slug}?denied=1`);
  });

/** A course of this organizer's race, or a 404. Always used after `requireOrganizer`. */
export const requireCourse = createMiddleware<AppEnv & { Variables: CourseVars }>(async (c, next) => {
  const course = await db(c.env.DB).courseById(c.req.param('courseId') ?? '');
  if (!course || course.raceId !== c.get('race').id) return c.notFound();
  c.set('course', course);
  await next();
});
