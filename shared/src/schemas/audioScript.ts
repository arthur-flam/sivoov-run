import { z } from 'zod';
import { AudioCategorySchema, AudioTriggerSchema, MixModeSchema, TakeWhenSchema } from './audio';

/** The voice that reads the script. One voice per script (AUDIO.md), chosen in the studio. */
export const ScriptVoiceSchema = z.object({
  /** ElevenLabs voice id, or a Gemini voice name ("Sadachbia") when the model is a Gemini one. */
  id: z.string().min(1),
  name: z.string(),
  /** ElevenLabs model (`eleven_v3` reads `[tags]`, older models get the text without them), or a Gemini TTS model. */
  model: z.string().min(1),
  /** 0 expressive … 1 steady. Absent: the provider's default for the model (the render cache key ignores it then). */
  stability: z.number().min(0).max(1).optional(),
  /** A Gemini voice's direction: who is speaking and how, played and never read (domain/geminiVoice.ts). */
  direction: z.string().max(1000).optional(),
});
export type ScriptVoice = z.infer<typeof ScriptVoiceSchema>;

/** Sound files an organizer may use in place of the voice: formats both phones play. */
export const AudioUploadFormatSchema = z.enum(['mp3', 'm4a', 'wav']);
export type AudioUploadFormat = z.infer<typeof AudioUploadFormatSchema>;

/** 5 MB: a few minutes of MP3, about 30 s of WAV. The pack is downloaded over a phone connection. */
export const MAX_AUDIO_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * The organizer's own recording for one line (the race director's voice, a crowd, a bell),
 * stored in R2 by content hash. A line that has one plays it instead of the rendered voice.
 */
export const UploadedAudioSchema = z.object({
  kind: z.literal('upload'),
  /** sha256 of the file's bytes: the R2 key is `studio-uploads/<hash>.<format>`. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  format: AudioUploadFormatSchema,
  bytes: z.number().int().positive().max(MAX_AUDIO_UPLOAD_BYTES),
  /** The file name as the organizer chose it, shown back to them. */
  name: z.string().max(200).default(''),
});
export type UploadedAudio = z.infer<typeof UploadedAudioSchema>;

/**
 * A line said differently to each runner, on top of its offline version (the line's `text`):
 * - `template`: the organizer's sentence with placeholders (`{prenom}`, `{temps}`, see
 *   domain/placeholders.ts), filled with the runner's values;
 * - `ai`: instructions; the AI writes the sentence for each runner, before the start.
 * Rendered per runner while the phone has a network; the offline version plays otherwise.
 */
export const PersonalLineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('template'), template: z.string().min(1).max(1000) }),
  z.object({ kind: z.literal('ai'), prompt: z.string().min(1).max(1500) }),
]);
export type PersonalLine = z.infer<typeof PersonalLineSchema>;

/**
 * Another way of saying a line (a pool: the tenth cheer must not sound like the first). Like the
 * line itself: the words everyone hears or the organizer's file, maybe a personal version, and
 * maybe a condition read from the run (`when`). Its file in the pack is `<key>~<id>.<ext>`.
 */
export const ScriptTakeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  text: z.string(),
  audio: UploadedAudioSchema.optional(),
  personal: PersonalLineSchema.optional(),
  when: TakeWhenSchema.optional(),
});
export type ScriptTake = z.infer<typeof ScriptTakeSchema>;

/**
 * Who says a line when it is not the script's voice: a regular in the crowd shouting the
 * runner's name. Same model as the script's voice; a Gemini voice name and its direction.
 */
export const LineVoiceSchema = z.object({ id: z.string().min(1), direction: z.string().max(1000) });
export type LineVoice = z.infer<typeof LineVoiceSchema>;

/**
 * One line of the script: an AudioEvent plus the text the voice reads. This is the
 * authoring shape, edited in the organizer studio and rendered by the TTS; the app never
 * sees it (the pack it downloads carries titles and file keys only).
 */
export const ScriptLineSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  category: AudioCategorySchema,
  mix: MixModeSchema,
  priority: z.number().int().min(0).max(10),
  once: z.boolean().default(true),
  trigger: AudioTriggerSchema,
  /** File key in the pack, without extension. */
  key: z.string().min(1),
  /** Before personal lines: slot names of a caption-only template. Read by `upgradeLine` only. */
  slots: z.array(z.string()).optional(),
  /**
   * What the voice reads, the same for every runner (v3 `[tags]` allowed). For a personal line
   * it is the offline version. Empty while the organizer has not written it: publishing waits.
   */
  text: z.string(),
  /** The organizer's own sound for this line. When present, it is played and the text is not read. */
  audio: UploadedAudioSchema.optional(),
  /** Said differently to each runner, `text` being the offline version. */
  personal: PersonalLineSchema.optional(),
  /** The organizer's ambiance under this line (AudioEvent.under): it starts with the line and outlasts it. */
  under: UploadedAudioSchema.optional(),
  /** Other ways of saying it; the line's own words are one more take, with no condition. */
  takes: z.array(ScriptTakeSchema).optional(),
  /** Said by someone else than the script's voice (a regular in the crowd). */
  voice: LineVoiceSchema.optional(),
});
export type ScriptLine = z.infer<typeof ScriptLineSchema>;
export type ScriptLineInput = z.input<typeof ScriptLineSchema>;

/**
 * What was last published from this draft, so the admin can say whether anything changed
 * since: the pack version, when, and a fingerprint of everything the pack depends on
 * (`publishedContent` in domain/audioScript.ts).
 */
export const PublishedMarkSchema = z.object({
  version: z.number().int().positive(),
  at: z.string().min(1),
  fingerprint: z.string().min(1),
});
export type PublishedMark = z.infer<typeof PublishedMarkSchema>;

/** The draft for one (course, locale). `version` is the version the next publish produces. */
export const AudioScriptSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  locale: z.enum(['fr', 'en']).default('fr'),
  voice: ScriptVoiceSchema,
  lines: z.array(ScriptLineSchema),
  /** The longest the race stays quiet while the runner runs, seconds; the rhythm director fills past it (150 when absent). */
  maxGapS: z.number().int().min(30).max(900).optional(),
  /** Written by publishing only; the studio's saves keep whatever is stored. */
  published: PublishedMarkSchema.optional(),
});
export type AudioScript = z.infer<typeof AudioScriptSchema>;
export type AudioScriptInput = z.input<typeof AudioScriptSchema>;

/**
 * What the Worker keeps, per published pack, to say its personal lines to each runner: stored
 * privately beside the pack (never in the public manifest, which carries no script text).
 */
export const PersonalDefSchema = z.object({
  eventId: z.string().min(1),
  /** One of the line's takes; absent: the line's own personal version. */
  takeId: z.string().min(1).optional(),
  /** The line's own voice (LineVoiceSchema), when it is not the script's. */
  voice: LineVoiceSchema.optional(),
  title: z.string(),
  /** When it plays, in the studio's words ("Au km 21,1"): context for the AI. */
  when: z.string().default(''),
  phase: z.enum(['prepare', 'live']),
  personal: PersonalLineSchema,
  /** The offline version, the AI's example of tone and length. */
  fallback: z.string(),
  /** A finish line: `{temps}` is the official time. */
  finish: z.boolean(),
});
export type PersonalDef = z.infer<typeof PersonalDefSchema>;

export const PersonalDefsSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  locale: z.enum(['fr', 'en']),
  voice: ScriptVoiceSchema,
  lines: z.array(PersonalDefSchema),
});
export type PersonalDefs = z.infer<typeof PersonalDefsSchema>;
