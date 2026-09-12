import { z } from 'zod';
import {
  AddressSchema,
  CourseSchema,
  DeviceInfoSchema,
  EntrantSchema,
  LandmarkSchema,
  RaceSchema,
  RaceThemeSchema,
  RunSchema,
  SplitSchema,
} from '@sivoov/shared';
import type { Course, Entrant, Race, Run } from '@sivoov/shared';

/**
 * D1 rows are snake_case with JSON columns as text. Each row schema parses what D1 returns
 * and each mapper produces the shared domain type. Domain -> row on the way in.
 */
const json = <T extends z.ZodType>(schema: T) => z.string().transform((s, ctx) => {
  const parsed = schema.safeParse(JSON.parse(s));
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', message: parsed.error.message });
    return z.NEVER;
  }
  return parsed.data as z.infer<T>;
});

export const RaceRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  date_start: z.string(),
  date_end: z.string(),
  window_start: z.string(),
  window_end: z.string(),
  timezone: z.string(),
  organizer_url: z.string().nullable(),
  theme: json(RaceThemeSchema),
  status: z.string(),
});

export const raceFromRow = (row: unknown): Race => {
  const r = RaceRowSchema.parse(row);
  return RaceSchema.parse({
    id: r.id, slug: r.slug, name: r.name, city: r.city, country: r.country,
    dateStart: r.date_start, dateEnd: r.date_end, windowStart: r.window_start, windowEnd: r.window_end,
    timezone: r.timezone, organizerUrl: r.organizer_url ?? undefined, theme: r.theme, status: r.status,
  });
};

export const CourseRowSchema = z.object({
  id: z.string(),
  race_id: z.string(),
  distance_key: z.string(),
  distance_m: z.number(),
  geometry_key: z.string().nullable(),
  landmarks: json(z.array(LandmarkSchema)),
});

export const courseFromRow = (row: unknown): Course => {
  const r = CourseRowSchema.parse(row);
  return CourseSchema.parse({
    id: r.id, raceId: r.race_id, distanceKey: r.distance_key, distanceM: r.distance_m,
    geometryKey: r.geometry_key ?? undefined, landmarks: r.landmarks,
  });
};

export const EntrantRowSchema = z.object({
  id: z.string(),
  race_id: z.string(),
  bib: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  distance_key: z.string(),
  address: json(AddressSchema).nullable(),
  source: z.string(),
  slot_at: z.string().nullable(),
});

export const entrantFromRow = (row: unknown): Entrant => {
  const r = EntrantRowSchema.parse(row);
  return EntrantSchema.parse({
    id: r.id, raceId: r.race_id, bib: r.bib, email: r.email, firstName: r.first_name, lastName: r.last_name,
    distanceKey: r.distance_key, address: r.address ?? undefined, source: r.source, slotAt: r.slot_at ?? undefined,
  });
};

export const RunRowSchema = z.object({
  id: z.string(),
  entrant_id: z.string(),
  course_id: z.string(),
  status: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  elapsed_ms: z.number(),
  distance_m: z.number(),
  splits: json(z.array(SplitSchema)),
  source: z.string(),
  device: json(DeviceInfoSchema).nullable(),
  trace_key: z.string().nullable(),
});

export const runFromRow = (row: unknown): Run => {
  const r = RunRowSchema.parse(row);
  return RunSchema.parse({
    id: r.id, entrantId: r.entrant_id, courseId: r.course_id, status: r.status,
    startedAt: r.started_at ?? undefined, finishedAt: r.finished_at ?? undefined,
    elapsedMs: r.elapsed_ms, distanceM: r.distance_m, splits: r.splits, source: r.source, device: r.device ?? undefined,
  });
};
