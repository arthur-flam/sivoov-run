import { z } from 'zod';

/** One line of text from a public form: trimmed, inner whitespace (newlines included) collapsed. */
const line = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1).max(max));

/**
 * What a race organizer sends from the contact form on /organisateurs. Everything but the
 * message is required; an empty message is no message.
 */
export const LeadInputSchema = z.object({
  name: line(120),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  race: line(160),
  message: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((s) => s || undefined),
});
export type LeadInput = z.infer<typeof LeadInputSchema>;

/** A stored lead, as Sivoov staff see it. `handledAt` is set once someone has answered. */
export const LeadSchema = LeadInputSchema.extend({
  id: z.string().min(1),
  locale: z.enum(['fr', 'en']),
  createdAt: z.iso.datetime({ offset: true }),
  handledAt: z.iso.datetime({ offset: true }).optional(),
});
export type Lead = z.infer<typeof LeadSchema>;
