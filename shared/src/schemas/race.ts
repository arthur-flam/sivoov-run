import { z } from 'zod';

/** Distances a race can open virtually. Keys are stable identifiers used in URLs and rows. */
export const DistanceKeySchema = z.enum(['marathon', 'half', '10k', '5k']);
export type DistanceKey = z.infer<typeof DistanceKeySchema>;

export const DISTANCE_METERS: Record<DistanceKey, number> = {
  marathon: 42195,
  half: 21097.5,
  '10k': 10000,
  '5k': 5000,
};

export const RaceStatusSchema = z.enum(['draft', 'open', 'live', 'closed']);
export type RaceStatus = z.infer<typeof RaceStatusSchema>;

/** The race layer of the design: what the organizer brings. Everything else is Sivoov. */
export const RaceThemeSchema = z.object({
  displayName: z.string().min(1),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  onPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logo: z.url().optional(),
  hero: z.url().optional(),
  medal: z.url().optional(),
  partnerLogos: z.array(z.url()).default([]),
});
export type RaceTheme = z.infer<typeof RaceThemeSchema>;

export const RaceSchema = z.object({
  id: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug is lowercase words joined by dashes'),
  name: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2).default('FR'),
  /** Physical race dates (inclusive), ISO dates. */
  dateStart: z.iso.date(),
  dateEnd: z.iso.date(),
  /** Virtual window (inclusive), ISO datetimes with offset. */
  windowStart: z.iso.datetime({ offset: true }),
  windowEnd: z.iso.datetime({ offset: true }),
  timezone: z.string().default('Europe/Paris'),
  organizerUrl: z.url().optional(),
  /** Where runners write when they are stuck; shown on the race page and in the app. */
  supportEmail: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  theme: RaceThemeSchema,
  status: RaceStatusSchema.default('draft'),
});
export type Race = z.infer<typeof RaceSchema>;
