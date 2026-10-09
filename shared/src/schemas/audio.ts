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
  /**
   * No place of its own: the rhythm director (domain/rhythm.ts) plays it when the race has been
   * quiet too long, a crowd shouting the runner's name, a word from the speaker. Apps that
   * predate it cannot read a pack that has one.
   */
  z.object({ kind: z.literal('filler') }),
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

/**
 * When a take fits the run, read from the run and never asked (domain/runReading.ts):
 * - `steady` / `faster` / `slower`: the last kilometre against the runner's own pace over km 1-2;
 * - `round`: a round finish time (whole five minutes) is within reach, or just held;
 * - `restart`: the runner is moving again after 20 s or more stopped or walking.
 */
export const TakeWhenSchema = z.enum(['steady', 'faster', 'slower', 'round', 'restart']);
export type TakeWhen = z.infer<typeof TakeWhenSchema>;

/**
 * Another way of saying a line: its own file, words and condition. The engine says one the
 * runner has not heard in this run, a take written for this moment of the run first (`pickTake`).
 * Apps that predate takes play the line's own file.
 */
export const PackTakeSchema = z.object({
  id: z.string().min(1),
  /** File key in the pack: the take's offline sound. */
  key: z.string().min(1),
  caption: z.string().optional(),
  when: TakeWhenSchema.optional(),
  personal: z.object({ phase: z.enum(['prepare', 'live']) }).optional(),
});
export type PackTake = z.infer<typeof PackTakeSchema>;

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
  /** Other ways of saying it (PackTakeSchema); the line's own file is the take with no id. */
  takes: z.array(PackTakeSchema).optional(),
});
export type AudioEvent = z.infer<typeof AudioEventSchema>;

export const AudioFileSchema = z.object({
  url: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  /** How long it plays, when publishing could read it: the rhythm director counts silences with it. */
  seconds: z.number().nonnegative().optional(),
});
export type AudioFile = z.infer<typeof AudioFileSchema>;

export const AudioPackSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  locale: z.enum(['fr', 'en']).default('fr'),
  events: z.array(AudioEventSchema),
  files: z.record(z.string(), AudioFileSchema),
  /**
   * The longest the race stays quiet while the runner runs, seconds (the rhythm director's; 150
   * when absent). At least 90: a filler needs 30 s of quiet and 40 s of room before the next line.
   */
  maxGapS: z.number().int().min(90).max(900).optional(),
});
export type AudioPack = z.infer<typeof AudioPackSchema>;

/** A runner's own versions of the personal lines of one pack: `personalKey` -> file. */
export const PersonalVoicesSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  files: z.record(z.string(), AudioFileSchema),
  /** What each of those files says (`personalKey` -> words), for the run screen's captions. */
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
  /** The round finish time within reach (`{objectif}`), and the runner's own pace over km 1-2 (`{allure_depart}`). */
  targetS: z.number().min(0).max(172_800).optional(),
  refPaceS: z.number().min(60).max(3600).optional(),
  /** Their fastest kilometre so far, which one and how long (`{meilleur_km}`). */
  bestKm: z.number().int().min(1).max(250).optional(),
  bestKmS: z.number().min(30).max(7200).optional(),
  finish: z.boolean().optional(),
});
export type LiveFacts = z.infer<typeof LiveFactsSchema>;

export const LiveVoiceRequestSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  eventId: z.string().min(1),
  /** The take the engine chose; absent: the line's own. */
  take: z.string().min(1).optional(),
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
