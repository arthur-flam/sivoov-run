import { z } from 'zod';

/** A person allowed into a race's admin. Identified by email, signed in with a magic code. */
export const OrganizerSchema = z.object({
  id: z.string().min(1),
  raceId: z.string().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
});
export type Organizer = z.infer<typeof OrganizerSchema>;
