import { z } from 'zod';

/**
 * The moments of the start ceremony, in the order they are played: `armed` as soon as the
 * runner presses Start (the intro, the call to the line), then the `countdown`, whose file the
 * on-screen digits follow, then the `gun`, whose first second is the start of the race.
 */
export const CueMomentSchema = z.enum(['armed', 'countdown', 'gun']);
export type CueMoment = z.infer<typeof CueMomentSchema>;

export const CueTriggerSchema = z.object({
  kind: z.literal('cue'),
  at: CueMomentSchema,
  /** Play order among the lines of the same moment. */
  order: z.number().int().nonnegative(),
});
export type CueTrigger = z.infer<typeof CueTriggerSchema>;

export const AudioTriggerSchema = z.discriminatedUnion('kind', [
  /** Before the clock starts: played in sequence by the start ceremony, never by the run. */
  CueTriggerSchema,
  z.object({ kind: z.literal('start') }),
  z.object({ kind: z.literal('finish') }),
  /** Fires once the runner has covered `meters` along the course. */
  z.object({ kind: z.literal('distance'), meters: z.number().nonnegative() }),
  /** Recurring, every `everyMeters` (splits). */
  z.object({ kind: z.literal('split'), everyMeters: z.number().positive().default(1000) }),
  /** Pace coaching: fires when the current pace leaves the band, once past `afterMeters`. */
  z.object({
    kind: z.literal('pace'),
    slowerThan: z.number().positive().optional(),
    fasterThan: z.number().positive().optional(),
    afterMeters: z.number().nonnegative().default(1000),
  }),
  z.object({ kind: z.literal('elapsed'), seconds: z.number().nonnegative() }),
]);
export type AudioTrigger = z.infer<typeof AudioTriggerSchema>;

export const AudioSourceSchema = z.discriminatedUnion('kind', [
  /** A file in the pack, by key. */
  z.object({ kind: z.literal('file'), key: z.string().min(1) }),
  /** A template rendered per slot value (pre-rendered files or on-device TTS). */
  z.object({ kind: z.literal('template'), key: z.string().min(1), slots: z.array(z.string()) }),
]);
export type AudioSource = z.infer<typeof AudioSourceSchema>;

export const MixModeSchema = z.enum(['duck', 'wait', 'interrupt']);
export type MixMode = z.infer<typeof MixModeSchema>;

export const AudioCategorySchema = z.enum(['ceremony', 'course', 'coaching', 'personal', 'safety']);
export type AudioCategory = z.infer<typeof AudioCategorySchema>;

export const AudioEventSchema = z.object({
  id: z.string().min(1),
  trigger: AudioTriggerSchema,
  source: AudioSourceSchema,
  mix: MixModeSchema.default('duck'),
  priority: z.number().int().min(0).max(10).default(5),
  category: AudioCategorySchema,
  once: z.boolean().default(true),
  /** Human label for the trace and the organizer review. */
  title: z.string().optional(),
});
export type AudioEvent = z.infer<typeof AudioEventSchema>;

export const AudioFileSchema = z.object({
  url: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().min(1),
});
export type AudioFile = z.infer<typeof AudioFileSchema>;

export const AudioPackSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  locale: z.enum(['fr', 'en']).default('fr'),
  events: z.array(AudioEventSchema),
  files: z.record(z.string(), AudioFileSchema),
});
export type AudioPack = z.infer<typeof AudioPackSchema>;
