import { z } from 'zod';

/** One GPS fix as delivered by the device, the simulation or a replayed trace. */
export const LocationSampleSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Horizontal accuracy in meters, if known. */
  accuracy: z.number().nonnegative().optional(),
  altitude: z.number().optional(),
  /** Device-reported speed in m/s, if known. */
  speed: z.number().nonnegative().optional(),
  /** Unix epoch milliseconds. */
  timestamp: z.number().int().nonnegative(),
});
export type LocationSample = z.infer<typeof LocationSampleSchema>;

export const SplitSchema = z.object({
  /** 1-based kilometer index. */
  km: z.number().int().positive(),
  /** Elapsed time at the end of this kilometer. */
  elapsedMs: z.number().int().nonnegative(),
  /** Duration of this kilometer alone. */
  splitMs: z.number().int().nonnegative(),
});
export type Split = z.infer<typeof SplitSchema>;

export const RunStatusSchema = z.enum(['planned', 'running', 'finished', 'uploaded', 'abandoned']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSourceSchema = z.enum(['app', 'upload', 'simulation']);
export type RunSource = z.infer<typeof RunSourceSchema>;

export const DeviceInfoSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  osVersion: z.string().optional(),
  model: z.string().optional(),
  appVersion: z.string().optional(),
});
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

export const RunSchema = z.object({
  id: z.string().min(1),
  entrantId: z.string().min(1),
  courseId: z.string().min(1),
  status: RunStatusSchema,
  startedAt: z.iso.datetime({ offset: true }).optional(),
  finishedAt: z.iso.datetime({ offset: true }).optional(),
  elapsedMs: z.number().int().nonnegative().default(0),
  distanceM: z.number().nonnegative().default(0),
  splits: z.array(SplitSchema).default([]),
  source: RunSourceSchema,
  device: DeviceInfoSchema.optional(),
});
export type Run = z.infer<typeof RunSchema>;

/** Everything the app uploads after a run, for results and debugging. */
export const RunTraceSchema = z.object({
  runId: z.string().min(1),
  samples: z.array(LocationSampleSchema),
  /** Audio events fired, with the distance and elapsed time at which they fired. */
  audioFired: z.array(
    z.object({ eventId: z.string(), distanceM: z.number().nonnegative(), elapsedMs: z.number().int().nonnegative() }),
  ),
});
export type RunTrace = z.infer<typeof RunTraceSchema>;
