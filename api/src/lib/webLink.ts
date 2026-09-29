import type { Entrant, Race } from '@sivoov/shared';
import type { Bindings } from '../env';
import { photoQueries } from '../db/photoQueries';
import { randomHex, sha256Hex } from './crypto';

/** How long an app's link into the web stays good: long enough to open a browser, no more. */
export const WEB_LINK_TTL_MS = 5 * 60_000;

/** A one-use link the app opens: the browser gets its own web session, then goes to `next`. */
export const createWebLink = async (env: Bindings, race: Race, entrant: Entrant, next: string, nowMs = Date.now()): Promise<string> => {
  const code = randomHex(24);
  await photoQueries(env.DB).createWebLink(await sha256Hex(code), entrant.id, new Date(nowMs + WEB_LINK_TTL_MS).toISOString());
  return `${env.BASE_URL.replace(/\/+$/, '')}/${race.slug}/link?c=${code}&next=${encodeURIComponent(next)}`;
};

