import { z } from 'zod';

/**
 * What a member of a race's team may do. `owner` runs the race's admin (settings, team),
 * `editor` works on runners, results and the audio, `viewer` only looks and exports.
 */
export const OrgRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

/** A person allowed into a race's admin. Identified by email, signed in with a magic code. */
export const OrganizerSchema = z.object({
  id: z.string().min(1),
  raceId: z.string().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: OrgRoleSchema.default('owner'),
  name: z.string().trim().min(1).optional(),
  invitedBy: z.string().optional(),
  createdAt: z.string().optional(),
});
export type Organizer = z.infer<typeof OrganizerSchema>;
export type OrganizerInput = z.input<typeof OrganizerSchema>;
