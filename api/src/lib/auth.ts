import { createMiddleware } from 'hono/factory';
import type { Entrant } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { sha256Hex } from './crypto';

export type AuthVars = { entrant: Entrant; tokenHash: string };

/** Bearer session token -> entrant. 401 otherwise. */
export const requireEntrant = createMiddleware<AppEnv & { Variables: AuthVars }>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  const tokenHash = await sha256Hex(token);
  const entrant = await db(c.env.DB).entrantForToken(tokenHash);
  if (!entrant) return c.json({ error: 'unauthorized' }, 401);
  c.set('entrant', entrant);
  c.set('tokenHash', tokenHash);
  await next();
});
