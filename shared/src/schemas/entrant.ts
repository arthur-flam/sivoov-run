import { z } from 'zod';
import { DistanceKeySchema } from './race';

export const AddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  postalCode: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2).default('FR'),
});
export type Address = z.infer<typeof AddressSchema>;

export const EntrantSourceSchema = z.enum(['import', 'manual']);

/** One virtual entry: a bib in a race, tied to an email. Pre-loaded from the organizer's CSV. */
export const EntrantSchema = z.object({
  id: z.string().min(1),
  raceId: z.string().min(1),
  bib: z.string().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  distanceKey: DistanceKeySchema,
  address: AddressSchema.optional(),
  source: EntrantSourceSchema.default('import'),
  /** Runner-chosen start slot inside the window, ISO datetime. */
  slotAt: z.iso.datetime({ offset: true }).optional(),
});
export type Entrant = z.infer<typeof EntrantSchema>;

/** Public projection of an entrant: what the app and result pages may show. */
export const EntrantPublicSchema = EntrantSchema.pick({
  id: true,
  raceId: true,
  bib: true,
  firstName: true,
  lastName: true,
  distanceKey: true,
  slotAt: true,
});
export type EntrantPublic = z.infer<typeof EntrantPublicSchema>;
