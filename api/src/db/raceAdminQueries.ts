import { z } from 'zod';
import { LeadSchema } from '@sivoov/shared';
import type { Course, Lead, OrgRole, Organizer, Race } from '@sivoov/shared';

const LeadRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  race: z.string().nullable(),
  message: z.string().nullable(),
  locale: z.string(),
  created_at: z.string(),
  handled_at: z.string().nullable(),
});

export const leadFromRow = (row: unknown): Lead => {
  const r = LeadRowSchema.parse(row);
  return LeadSchema.parse({
    id: r.id, name: r.name, email: r.email, race: r.race || undefined, message: r.message || undefined, locale: r.locale,
    createdAt: r.created_at, handledAt: r.handled_at ?? undefined,
  });
};

/** Keeps at least one owner: the change only applies if the person is not the race's last owner. */
const KEEPS_AN_OWNER = "(role != 'owner' OR (SELECT COUNT(*) FROM organizers WHERE race_id = ? AND role = 'owner') > 1)";

/**
 * The race admin's own writes: creating a race with its courses and first owner, the team's
 * role changes, and the organizers' requests. Reads and writes of the race row itself go
 * through `db().raceBySlug` / `db().upsertRace`, and invitations of someone new through `adminDb().upsertOrganizer`.
 */
export const raceAdminDb = (d1: D1Database) => ({
  /** Every address already taken by a race, as slug or id. */
  async takenSlugs(): Promise<string[]> {
    const { results } = await d1.prepare('SELECT slug AS s FROM races UNION SELECT id AS s FROM races').all<{ s: string }>();
    return results.map((r) => r.s);
  },
  /** A new race, its courses and its first owner, all or nothing. Fails if the id or slug exists. */
  async createRace(race: Race, courses: readonly Course[], owner: Organizer): Promise<void> {
    await d1.batch([
      d1
        .prepare(
          `INSERT INTO races (id, slug, name, city, country, date_start, date_end, window_start, window_end, timezone, organizer_url, support_email, theme, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(race.id, race.slug, race.name, race.city, race.country, race.dateStart, race.dateEnd, race.windowStart, race.windowEnd,
          race.timezone, race.organizerUrl ?? null, race.supportEmail ?? null, JSON.stringify(race.theme), race.status),
      ...courses.map((c) =>
        d1
          .prepare('INSERT INTO courses (id, race_id, distance_key, distance_m, geometry_key, landmarks) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(c.id, c.raceId, c.distanceKey, c.distanceM, c.geometryKey ?? null, JSON.stringify(c.landmarks)),
      ),
      d1
        .prepare('INSERT INTO organizers (id, race_id, email, role, name, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(owner.id, owner.raceId, owner.email, owner.role, owner.name ?? null, owner.invitedBy ?? null, owner.createdAt ?? new Date().toISOString()),
    ]);
  },

  /**
   * Changes a member's role unless that would leave the race with no owner, in one statement so
   * two changes at the same moment cannot both pass. A name, when given, replaces theirs (an
   * invitation sent again). True when it changed.
   */
  async setRole(raceId: string, email: string, role: OrgRole, name?: string): Promise<boolean> {
    const res = await d1
      .prepare(`UPDATE organizers SET role = ?, name = COALESCE(?, name) WHERE race_id = ? AND email = ? AND (? = 'owner' OR ${KEEPS_AN_OWNER})`)
      .bind(role, name ?? null, raceId, email, role, raceId)
      .run();
    return res.meta.changes > 0;
  },
  /** Removes a member unless they are the race's last owner. True when removed. */
  async removeMember(raceId: string, email: string): Promise<boolean> {
    const res = await d1.prepare(`DELETE FROM organizers WHERE race_id = ? AND email = ? AND ${KEEPS_AN_OWNER}`).bind(raceId, email, raceId).run();
    return res.meta.changes > 0;
  },

  /** Newest first. */
  async leads(): Promise<Lead[]> {
    const { results } = await d1.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
    return results.map(leadFromRow);
  },
  /** Marks a request handled (a date) or open again (null). False when there is no such request. */
  async setLeadHandled(id: string, handledAt: string | null): Promise<boolean> {
    const res = await d1.prepare('UPDATE leads SET handled_at = ? WHERE id = ?').bind(handledAt, id).run();
    return res.meta.changes > 0;
  },
});

export type RaceAdminDb = ReturnType<typeof raceAdminDb>;
