import { z } from 'zod';
import { LocaleSchema } from './locale';

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

/**
 * A link or a picture on a page: web addresses only. `z.url()` alone accepts `javascript:` and
 * friends, and these are typed by organizers and shown to everyone.
 */
export const WebUrlSchema = z.url({ protocol: /^https?$/ });

/**
 * A circuit the race belongs to (the Paris Masters Circuit): its stages, in order, and what
 * finishing all of them earns. Shown on the race page; `current` marks this race.
 */
export const RaceSeriesSchema = z.object({
  name: z.string().min(1),
  url: WebUrlSchema.optional(),
  stages: z
    .array(
      z.object({
        name: z.string().min(1),
        date: z.iso.date(),
        place: z.string().min(1),
        logo: WebUrlSchema.optional(),
        current: z.boolean().default(false),
      }),
    )
    .min(1),
  /** What completing every stage earns, in a sentence ("Le support collector pour les trois médailles"). */
  reward: z.string().optional(),
});
export type RaceSeries = z.infer<typeof RaceSeriesSchema>;

/** The race layer of the design: what the organizer brings. Everything else is Sivoov. */
export const RaceThemeSchema = z.object({
  displayName: z.string().min(1),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  onPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** A second colour from the race's identity, for the one thing that must stand out (the play button, the runner's trace). */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logo: WebUrlSchema.optional(),
  hero: WebUrlSchema.optional(),
  medal: WebUrlSchema.optional(),
  partnerLogos: z.array(WebUrlSchema).default([]),
  series: RaceSeriesSchema.optional(),
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
  organizerUrl: WebUrlSchema.optional(),
  /** Where runners write when they are stuck; shown on the race page and in the app. */
  supportEmail: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  theme: RaceThemeSchema,
  /** The language of the app and the emails for a runner who has not chosen one (Réglages). */
  defaultLocale: LocaleSchema.default('fr'),
  status: RaceStatusSchema.default('draft'),
  /**
   * A demonstration of another race (its id): the organizers' testers and App Review run it.
   * It has its own runners, results and admin, and borrows the real race's courses and sound,
   * so it always plays what the real race plays (docs/ARCHITECTURE.md, "Demo races").
   */
  demoOf: z.string().min(1).optional(),
});
export type Race = z.infer<typeof RaceSchema>;
