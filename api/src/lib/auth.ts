import { createMiddleware } from 'hono/factory';
import { CLIENT_HEADER, parseClientHeader, shouldRecordVisit } from '@sivoov/shared';
import type { Entrant } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { runnerDb } from '../db/runnerQueries';
import { sha256Hex } from './crypto';

export type AuthVars = { entrant: Entrant; tokenHash: string };

/**
 * Bearer session token -> entrant. 401 otherwise. On the way, the session remembers the visit
 * (at most every ten minutes) and the phone named by the app's `X-Sivoov-Client` header, so the
 * organizer can see who reached the app. That write happens after the response.
 */
export const requireEntrant = createMiddleware<AppEnv & { Variables: AuthVars }>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  const tokenHash = await sha256Hex(token);
  const q = runnerDb(c.env.DB);
  const now = new Date();
  const session = await q.sessionForToken(tokenHash, now.toISOString());
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  const device = parseClientHeader(c.req.header(CLIENT_HEADER));
  if (shouldRecordVisit(session, device, now)) c.executionCtx.waitUntil(q.recordVisit(session.id, now.toISOString(), device));
  c.set('entrant', session.entrant);
  c.set('tokenHash', tokenHash);
  await next();
});
