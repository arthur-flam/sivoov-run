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

/**
 * How much of the race the runner wants to hear (« moins de voix », AUDIO_EXPERIENCE.md X1):
 * `all` every line, `course` the places and the kilometres, `essential` the start, the finish
 * and safety. A runner's choice, never the organizer's.
 */
export const VoiceLevelSchema = z.enum(['all', 'course', 'essential']);
export type VoiceLevel = z.infer<typeof VoiceLevelSchema>;

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
  /**
   * What the voice says, as the runner reads it on the run screen: the line's text without its
   * voice tags. For a personal line, its offline version. Packs published before it have none.
   */
  caption: z.string().optional(),
  /**
   * A personal line: the source file is its offline version; the runner's own version comes
   * from `/api/me/voices` (`prepare`: before the start) or `/api/me/voices/live` (`live`: when
   * it plays). Apps that predate it ignore the field and play the offline version.
   */
  personal: z.object({ phase: z.enum(['prepare', 'live']) }).optional(),
  /**
   * An ambiance played under this line (a crowd, the music of the start): a file in the pack
   * that starts with the line's sound and plays to its own end, over the next lines, until
   * another line brings its own ambiance or the run stops. Apps that predate it ignore it.
   */
  under: z.string().min(1).optional(),
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

/** A runner's own versions of the personal lines of one pack: event id -> file. */
export const PersonalVoicesSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  files: z.record(z.string(), AudioFileSchema),
  /** What each of those files says (event id -> words), for the run screen's captions. */
  captions: z.record(z.string(), z.string()).default({}),
});
export type PersonalVoices = z.infer<typeof PersonalVoicesSchema>;

/**
 * What the run knows when a live personal line plays, bounded. Every field is optional: a
 * missing one means the offline version plays. `km` is the kilometres completed, `finish` makes
 * `{temps}` the official time with every unit said (domain/placeholders.ts).
 */
export const LiveFactsSchema = z.object({
  km: z.number().int().min(0).max(250).optional(),
  elapsedS: z.number().min(0).max(172_800).optional(),
  lastKmS: z.number().min(30).max(7200).optional(),
  paceSecPerKm: z.number().min(60).max(3600).optional(),
  projectedS: z.number().min(0).max(172_800).optional(),
  finish: z.boolean().optional(),
});
export type LiveFacts = z.infer<typeof LiveFactsSchema>;

export const LiveVoiceRequestSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  eventId: z.string().min(1),
  facts: LiveFactsSchema,
});
export type LiveVoiceRequest = z.infer<typeof LiveVoiceRequestSchema>;

export const LiveVoiceSchema = z.object({
  url: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  /** The words the file says, for the run screen's caption. */
  caption: z.string().optional(),
});
export type LiveVoice = z.infer<typeof LiveVoiceSchema>;

/**
 * A course's demo reel: the whole race condensed to a few minutes (the ceremony, the places,
 * the finish, said to a sample runner), one produced MP3 for the race page and for listening
 * without running. Chapters say where each moment starts, and how far along the course it is.
 */
export const DemoReelSchema = z.object({
  courseId: z.string().min(1),
  duration: z.number().positive(),
  /** The sample runner's pace, for the race clock the page shows. */
  paceSecPerKm: z.number().positive(),
  chapters: z
    .array(
      z.object({
        t: z.number().nonnegative(),
        title: z.string(),
        km: z.number().nonnegative(),
        caption: z.string(),
        /** The countdown (digits), the gun (the clock starts), the finish (the clock stops). */
        mark: z.enum(['countdown', 'gun', 'finish']).optional(),
      }),
    )
    .min(1),
});
export type DemoReel = z.infer<typeof DemoReelSchema>;
