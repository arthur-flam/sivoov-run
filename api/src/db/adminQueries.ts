import { z } from 'zod';
import { OrganizerSchema, OrgRoleSchema } from '@sivoov/shared';
import type { OrgRole, Organizer, Race } from '@sivoov/shared';
import { raceFromRow } from './rows';

const OrganizerRowSchema = z.object({
  id: z.string(),
  race_id: z.string(),
  email: z.string(),
  role: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  invited_by: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export const organizerFromRow = (row: unknown): Organizer => {
  const r = OrganizerRowSchema.parse(row);
  return OrganizerSchema.parse({
    id: r.id, raceId: r.race_id, email: r.email, role: r.role ?? undefined, name: r.name ?? undefined,
    invitedBy: r.invited_by ?? undefined, createdAt: r.created_at ?? undefined,
  });
};

export type ActiveCode = { id: string; code_hash: string; expires_at: string; attempts: number };
export type RaceWithRole = { race: Race; role: OrgRole | null };

/**
 * The organizer admin's identity layer: codes and sessions keyed by email, and race
 * membership with its role. Staff are not rows here: they come from the STAFF_EMAILS var.
 */
export const adminDb = (d1: D1Database) => ({
  async createCode(id: string, email: string, codeHash: string, expiresAt: string): Promise<void> {
    await d1.batch([
      d1.prepare('UPDATE admin_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL').bind(new Date().toISOString(), email),
      d1.prepare('INSERT INTO admin_codes (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)').bind(id, email, codeHash, expiresAt),
    ]);
  },
  async activeCode(email: string): Promise<ActiveCode | null> {
    return d1
      .prepare('SELECT id, code_hash, expires_at, attempts FROM admin_codes WHERE email = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1')
      .bind(email)
      .first<ActiveCode>();
  },
  async codesRequestedSince(email: string, sinceIso: string): Promise<number> {
    const row = await d1.prepare('SELECT COUNT(*) AS n FROM admin_codes WHERE email = ? AND created_at > ?').bind(email, sinceIso).first<{ n: number }>();
    return row?.n ?? 0;
  },
  async bumpAttempts(codeId: string): Promise<void> {
    await d1.prepare('UPDATE admin_codes SET attempts = attempts + 1 WHERE id = ?').bind(codeId).run();
  },
  async consumeCode(codeId: string): Promise<void> {
    await d1.prepare('UPDATE admin_codes SET consumed_at = ? WHERE id = ?').bind(new Date().toISOString(), codeId).run();
  },

  async createSession(id: string, email: string, tokenHash: string, expiresAt: string): Promise<void> {
    await d1.prepare('INSERT INTO admin_sessions (id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)').bind(id, email, tokenHash, expiresAt).run();
  },
  async emailForToken(tokenHash: string): Promise<string | null> {
    const row = await d1.prepare('SELECT email FROM admin_sessions WHERE token_hash = ? AND expires_at > ?').bind(tokenHash, new Date().toISOString()).first<{ email: string }>();
    return row?.email ?? null;
  },
  async deleteSession(tokenHash: string): Promise<void> {
    await d1.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(tokenHash).run();
  },

  /** Is this email on the team of at least one race? Only then does it get a code. */
  async isMember(email: string): Promise<boolean> {
    return (await d1.prepare('SELECT 1 AS one FROM organizers WHERE email = ? LIMIT 1').bind(email).first()) !== null;
  },
  async membership(raceId: string, email: string): Promise<Organizer | null> {
    const row = await d1.prepare('SELECT * FROM organizers WHERE race_id = ? AND email = ?').bind(raceId, email.trim().toLowerCase()).first();
    return row ? organizerFromRow(row) : null;
  },
  /** The races this email belongs to, with its role; staff get every race, drafts included. */
  async racesFor(email: string, staff: boolean): Promise<RaceWithRole[]> {
    const { results } = await d1
      .prepare(
        staff
          ? 'SELECT r.*, o.role AS member_role FROM races r LEFT JOIN organizers o ON o.race_id = r.id AND o.email = ? ORDER BY r.date_start DESC'
          : 'SELECT r.*, o.role AS member_role FROM races r JOIN organizers o ON o.race_id = r.id AND o.email = ? ORDER BY r.date_start DESC',
      )
      .bind(email)
      .all<Record<string, unknown> & { member_role: string | null }>();
    return results.map((row) => ({ race: raceFromRow(row), role: row.member_role === null ? null : OrgRoleSchema.parse(row.member_role) }));
  },

  async members(raceId: string): Promise<Organizer[]> {
    const { results } = await d1
      .prepare("SELECT * FROM organizers WHERE race_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, email")
      .bind(raceId)
      .all();
    return results.map(organizerFromRow);
  },
  /** Idempotent on (race, email). A second call updates the role and the name. */
  async upsertOrganizer(organizer: Organizer): Promise<void> {
    await d1
      .prepare(
        `INSERT INTO organizers (id, race_id, email, role, name, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(race_id, email) DO UPDATE SET role=excluded.role, name=COALESCE(excluded.name, organizers.name)`,
      )
      .bind(organizer.id, organizer.raceId, organizer.email, organizer.role, organizer.name ?? null, organizer.invitedBy ?? null,
        organizer.createdAt ?? new Date().toISOString())
      .run();
  },
  async removeOrganizer(raceId: string, email: string): Promise<void> {
    await d1.prepare('DELETE FROM organizers WHERE race_id = ? AND email = ?').bind(raceId, email).run();
  },
});

export type AdminDb = ReturnType<typeof adminDb>;
