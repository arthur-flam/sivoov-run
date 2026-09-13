import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Organizer, Race } from '@sivoov/shared';
import type { AppEnv, Bindings } from '../env';
import { db } from '../db/queries';
import { orgDb } from '../db/orgQueries';
import { newId, randomCode, randomHex, sha256Hex } from './crypto';
import { mailerFor } from './mailer';
import { acceptsTestCode } from './testCode';
import { CODE_TTL_MS, MAX_CODES_PER_HOUR, MAX_CODE_ATTEMPTS } from './authService';
import { organizerCodeEmail } from '../pages/emails';

export const ORG_COOKIE = 'org_session';
export const ORG_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type OrgVars = { race: Race; organizer: Organizer; orgTokenHash: string };
export type OrgCodeResult = { ok: true; devCode?: string } | { ok: false; error: 'unknown_organizer' | 'too_many_requests' };
export type OrgVerifyResult = { ok: true; token: string; expiresAt: string; organizer: Organizer } | { ok: false; error: 'unknown_organizer' | 'bad_code' };

/**
 * Organizer sign-in mirrors the entrant flow (api/src/lib/authService.ts) on its own tables:
 * email -> six-digit code by mail -> cookie session, one month.
 */
export const requestOrganizerCode = async (env: Bindings, race: Race, email: string, defer: (p: Promise<unknown>) => void): Promise<OrgCodeResult> => {
  const q = orgDb(env.DB);
  const organizer = await q.organizerByEmail(race.id, email);
  if (!organizer) return { ok: false, error: 'unknown_organizer' };
  const recent = await q.codesRequestedSince(organizer.id, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent >= MAX_CODES_PER_HOUR) return { ok: false, error: 'too_many_requests' };
  const code = randomCode();
  await q.createCode(newId(), organizer.id, await sha256Hex(code), new Date(Date.now() + CODE_TTL_MS).toISOString());
  defer(mailerFor(env).send(organizerCodeEmail({ to: organizer.email, race, code })));
  return { ok: true, ...(env.ENVIRONMENT === 'local' ? { devCode: code } : {}) };
};

export const verifyOrganizerCode = async (env: Bindings, race: Race, email: string, code: string): Promise<OrgVerifyResult> => {
  const q = orgDb(env.DB);
  const organizer = await q.organizerByEmail(race.id, email);
  if (!organizer) return { ok: false, error: 'unknown_organizer' };
  const active = await q.activeCode(organizer.id);
  if (!acceptsTestCode(env, organizer.email, code)) {
    if (!active || active.expires_at < new Date().toISOString() || active.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, error: 'bad_code' };
    if (active.code_hash !== (await sha256Hex(code))) {
      await q.bumpAttempts(active.id);
      return { ok: false, error: 'bad_code' };
    }
    await q.consumeCode(active.id);
  }
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + ORG_SESSION_TTL_MS).toISOString();
  await q.createSession(newId(), organizer.id, await sha256Hex(token), expiresAt);
  return { ok: true, token, expiresAt, organizer };
};

export const signOutOrganizer = async (env: Bindings, token: string): Promise<void> => orgDb(env.DB).deleteSession(await sha256Hex(token));

/** `org_session` cookie -> organizer of this race, or a redirect to the organizer sign-in. */
export const requireOrganizer = createMiddleware<AppEnv & { Variables: OrgVars }>(async (c, next) => {
  const slug = c.req.param('slug') ?? '';
  const race = await db(c.env.DB).raceBySlug(slug);
  if (!race) return c.notFound();
  const token = getCookie(c, ORG_COOKIE);
  const tokenHash = token ? await sha256Hex(token) : null;
  const organizer = tokenHash ? await orgDb(c.env.DB).organizerForToken(tokenHash) : null;
  if (!organizer || !tokenHash || organizer.raceId !== race.id) return c.redirect(`/org/${race.slug}/signin`);
  c.set('race', race);
  c.set('organizer', organizer);
  c.set('orgTokenHash', tokenHash);
  await next();
});
