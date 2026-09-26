import type { Lead } from '@sivoov/shared';

/** Race organizers who wrote from /organisateurs (table `leads`, migration 0006). */
export const leadQueries = (d1: D1Database) => ({
  async insert(lead: Lead): Promise<void> {
    await d1
      .prepare('INSERT INTO leads (id, name, email, race, message, locale, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(lead.id, lead.name, lead.email, lead.race, lead.message ?? null, lead.locale, lead.createdAt)
      .run();
  },
  async countFromEmailSince(email: string, sinceIso: string): Promise<number> {
    const row = await d1.prepare('SELECT COUNT(*) AS n FROM leads WHERE email = ? AND created_at > ?').bind(email, sinceIso).first<{ n: number }>();
    return row?.n ?? 0;
  },
  /** Every lead stored since then, whoever sent it. */
  async countSince(sinceIso: string): Promise<number> {
    const row = await d1.prepare('SELECT COUNT(*) AS n FROM leads WHERE created_at > ?').bind(sinceIso).first<{ n: number }>();
    return row?.n ?? 0;
  },
});

const NETWORKS = 'admin/leads-ip/';
const DAY_MS = 86_400_000;

/** A key is `admin/leads-ip/<sha256 of the address>/<ISO time>_<lead id>`: a listing says when each post came. */
const postedAt = (key: string): number => Date.parse(key.slice(key.lastIndexOf('/') + 1).split('_')[0] ?? '');

/**
 * The leads posted from one network (the sender's IP address) in the last day, in R2, since the
 * `leads` table has no column for it. The address itself is never stored, only its SHA-256.
 * One small object per post rather than one list per network: a post is written first and the
 * day's posts counted after, so posts sent at the same moment cannot all read "under the limit".
 */
export const leadNetworks = (bucket: R2Bucket) => ({
  /** Counts this post among the network's day; past `max`, takes it back and returns false. */
  async admit(ipHash: string, leadId: string, now: Date, max: number): Promise<boolean> {
    const key = `${NETWORKS}${ipHash}/${now.toISOString()}_${leadId}`;
    await bucket.put(key, '');
    const { objects } = await bucket.list({ prefix: `${NETWORKS}${ipHash}/` });
    if (objects.filter((o) => now.getTime() - postedAt(o.key) < DAY_MS).length <= max) return true;
    await bucket.delete(key);
    return false;
  },
  /** Deletes the posts older than a day, up to a listing's worth at a time: nothing is kept past the limit's use. */
  async forgetOld(now: Date): Promise<void> {
    const { objects } = await bucket.list({ prefix: NETWORKS });
    const old = objects.filter((o) => now.getTime() - postedAt(o.key) >= DAY_MS).map((o) => o.key);
    if (old.length > 0) await bucket.delete(old);
  },
});
