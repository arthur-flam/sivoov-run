import { z } from 'zod';

/**
 * Photo moments: places of the race where the runner is asked for a selfie, which an image
 * model then puts into the real race (the organizer's own photos of the place, the bib, the
 * crowd). The organizer sets them in the admin; the runner sends their photos from the web.
 */

/** Where on the course: the start, the finish, or one of the course's places (a landmark id). */
export const MomentAtSchema = z.string().min(1).max(80);

export const PhotoMomentSchema = z.object({
  id: z.string().min(1),
  raceId: z.string().min(1),
  /** « Sur les Planches » */
  title: z.string().trim().min(1).max(80),
  at: MomentAtSchema,
  /** What the runner is asked for, in a sentence: « Un selfie, bras levés, le sourire du finisher. » */
  ask: z.string().trim().min(1).max(240),
  /** The scene the image model draws the runner into: the place, the light, the crowd. */
  scene: z.string().trim().min(1).max(1200),
  /** R2 keys of the organizer's photos of the place (at most three), under `races/<raceId>/`. */
  refs: z.array(z.string().min(1)).max(3).default([]),
  sort: z.number().int().default(0),
  createdAt: z.iso.datetime({ offset: true }),
});
export type PhotoMoment = z.infer<typeof PhotoMomentSchema>;

export const PhotoStatusSchema = z.enum(['rendering', 'done', 'failed']);
export type PhotoStatus = z.infer<typeof PhotoStatusSchema>;

export const RunnerPhotoSchema = z.object({
  id: z.string().min(1),
  entrantId: z.string().min(1),
  momentId: z.string().min(1),
  /** The runner's own photo, private (R2 `selfies/…`), kept to try again, erased with their data. */
  selfieKey: z.string().min(1),
  status: PhotoStatusSchema,
  /** The picture made (R2 `photos/…`), once done. */
  resultKey: z.string().optional(),
  /** Why it failed, for the organizer's eyes (never shown as is to the runner). */
  error: z.string().optional(),
  attempts: z.number().int().nonnegative().default(0),
  /** Shown on the runner's public result page: their choice, off until they turn it on. */
  shown: z.boolean().default(false),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type RunnerPhoto = z.infer<typeof RunnerPhotoSchema>;

/** A moment as the app sees it: where it falls on the runner's own course. */
export const CourseMomentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  ask: z.string(),
  meters: z.number().nonnegative(),
});
export type CourseMoment = z.infer<typeof CourseMomentSchema>;
