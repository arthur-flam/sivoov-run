import { z } from 'zod';

/**
 * A race organizer who asked to hear more, from the contact form of the public /organisateurs
 * page. Sivoov staff read them at /org/leads and mark them handled once they have answered.
 */
export const LeadSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  /** The race they organize, as they typed it. */
  race: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1).optional(),
  /** The language of the page they wrote from: 'fr' or 'en'. */
  locale: z.string().min(2).default('fr'),
  createdAt: z.string(),
  handledAt: z.string().optional(),
});
export type Lead = z.infer<typeof LeadSchema>;
