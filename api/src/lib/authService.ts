import { whichEntry } from '@sivoov/shared';
import type { CodeRequest, CodeVerify, Entrant, Race, SignInAmbiguity } from '@sivoov/shared';
import type { Bindings } from '../env';
import { db } from '../db/queries';
import type { Db } from '../db/queries';
import { newId, randomCode, randomHex, sha256Hex } from './crypto';
import { mailerFor } from './mailer';
import { acceptsReviewCode, acceptsTestCode, isTestAccount } from './testCode';
import { codeEmail } from '../pages/emails';

export const CODE_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 5;

type Ambiguous = { ok: false } & SignInAmbiguity;
export type CodeResult = { ok: true; devCode?: string } | { ok: false; error: 'unknown_entrant' | 'too_many_requests' } | Ambiguous;
export type VerifyResult = { ok: true; token: string; expiresAt: string; entrant: Entrant } | { ok: false; error: 'unknown_entrant' | 'bad_code' } | Ambiguous;

type Entry = { entrant: Entrant; race: Race };
type Found = { ok: true; entry: Entry } | { ok: false; error: 'unknown_entrant' } | Ambiguous;

/** The entry the email names, narrowed by the race and the bib when the runner was asked for them (`whichEntry`). */
const findEntry = async (q: Db, req: CodeRequest): Promise<Found> => {
  const choice = whichEntry(await q.entriesForEmail(req.email), req);
  if (choice.kind === 'one') return { ok: true, entry: choice.entry };
  if (choice.kind === 'none') return { ok: false, error: 'unknown_entrant' };
  return { ok: false, error: 'ambiguous', races: choice.races, bib: choice.bib };
};

/**
 * Step 1: the email (and the race or the bib, when asked) -> a code by email, sent in the
 * background via `defer`. A test account on production has no inbox: App Review types the
 * review code instead, so nothing is sent.
 */
export const requestCode = async (env: Bindings, req: CodeRequest, defer: (p: Promise<unknown>) => void): Promise<CodeResult> => {
  const q = db(env.DB);
  const found = await findEntry(q, req);
  if (!found.ok) return found;
  const { entrant, race } = found.entry;
  const recent = await q.codesRequestedSince(entrant.id, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent >= MAX_CODES_PER_HOUR) return { ok: false, error: 'too_many_requests' };
  const code = randomCode();
  await q.createCode(newId(), entrant.id, await sha256Hex(code), new Date(Date.now() + CODE_TTL_MS).toISOString());
  if (!(env.ENVIRONMENT === 'production' && isTestAccount(entrant.email))) defer(mailerFor(env).send(codeEmail({ to: entrant.email, firstName: entrant.firstName, race, code })));
  return { ok: true, ...(env.ENVIRONMENT === 'local' ? { devCode: code } : {}) };
};

/** Where a runner session was opened; the admin shows who reached the app. */
export type SessionClient = 'web' | 'app';

/** Step 2: the code -> a session token. Five attempts, fifteen minutes, one use. */
export const verifyCode = async (env: Bindings, req: CodeVerify, client: SessionClient = 'web'): Promise<VerifyResult> => {
  const q = db(env.DB);
  const found = await findEntry(q, req);
  if (!found.ok) return found;
  const { entrant, race } = found.entry;
  const active = await q.activeCode(entrant.id);
  const fixedCode = acceptsTestCode(env, entrant.email, req.code) || acceptsReviewCode(env, entrant.email, race, req.code);
  if (!fixedCode) {
    // Count the attempt before comparing, so a burst of parallel guesses cannot outrun the limit.
    if (!active || !(await q.claimAttempt(active.id, MAX_CODE_ATTEMPTS))) return { ok: false, error: 'bad_code' };
    if (active.code_hash !== (await sha256Hex(req.code))) return { ok: false, error: 'bad_code' };
    if (!(await q.consumeCode(active.id))) return { ok: false, error: 'bad_code' };
  } else if (active) {
    await q.consumeCode(active.id);
  }
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await q.createSession(newId(), entrant.id, await sha256Hex(token), expiresAt, client);
  return { ok: true, token, expiresAt, entrant };
};

export const entrantForToken = async (env: Bindings, token: string): Promise<Entrant | null> => db(env.DB).entrantForToken(await sha256Hex(token));
export const signOut = async (env: Bindings, token: string): Promise<void> => db(env.DB).deleteSession(await sha256Hex(token));
