import type { CodeRequest, CodeVerify, Entrant } from '@sivoov/shared';
import type { Bindings } from '../env';
import { db } from '../db/queries';
import { newId, randomCode, randomHex, sha256Hex } from './crypto';
import { mailerFor } from './mailer';
import { acceptsTestCode } from './testCode';
import { codeEmail } from '../pages/emails';

export const CODE_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 5;

export type CodeResult = { ok: true; devCode?: string } | { ok: false; error: 'unknown_entrant' | 'too_many_requests' };
export type VerifyResult = { ok: true; token: string; expiresAt: string; entrant: Entrant } | { ok: false; error: 'unknown_entrant' | 'bad_code' };

/** Step 1: bib + email -> a code by email. The mail is sent in the background via `defer`. */
export const requestCode = async (env: Bindings, req: CodeRequest, defer: (p: Promise<unknown>) => void): Promise<CodeResult> => {
  const q = db(env.DB);
  const race = await q.raceBySlug(req.raceSlug);
  const entrant = race ? await q.entrantByBibEmail(race.id, req.bib, req.email) : null;
  if (!race || !entrant) return { ok: false, error: 'unknown_entrant' };
  const recent = await q.codesRequestedSince(entrant.id, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent >= MAX_CODES_PER_HOUR) return { ok: false, error: 'too_many_requests' };
  const code = randomCode();
  await q.createCode(newId(), entrant.id, await sha256Hex(code), new Date(Date.now() + CODE_TTL_MS).toISOString());
  defer(mailerFor(env).send(codeEmail({ to: entrant.email, firstName: entrant.firstName, race, code })));
  return { ok: true, ...(env.ENVIRONMENT === 'local' ? { devCode: code } : {}) };
};

/** Where a runner session was opened; the admin shows who reached the app. */
export type SessionClient = 'web' | 'app';

/** Step 2: the code -> a session token. Five attempts, fifteen minutes, one use. */
export const verifyCode = async (env: Bindings, req: CodeVerify, client: SessionClient = 'web'): Promise<VerifyResult> => {
  const q = db(env.DB);
  const race = await q.raceBySlug(req.raceSlug);
  const entrant = race ? await q.entrantByBibEmail(race.id, req.bib, req.email) : null;
  if (!entrant) return { ok: false, error: 'unknown_entrant' };
  const active = await q.activeCode(entrant.id);
  const testCode = acceptsTestCode(env, entrant.email, req.code);
  if (!testCode) {
    if (!active || active.expires_at < new Date().toISOString() || active.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, error: 'bad_code' };
    if (active.code_hash !== (await sha256Hex(req.code))) {
      await q.bumpAttempts(active.id);
      return { ok: false, error: 'bad_code' };
    }
  }
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  if (active) await q.consumeCode(active.id);
  await q.createSession(newId(), entrant.id, await sha256Hex(token), expiresAt, client);
  return { ok: true, token, expiresAt, entrant };
};

export const entrantForToken = async (env: Bindings, token: string): Promise<Entrant | null> => db(env.DB).entrantForToken(await sha256Hex(token));
export const signOut = async (env: Bindings, token: string): Promise<void> => db(env.DB).deleteSession(await sha256Hex(token));
