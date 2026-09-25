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
});
