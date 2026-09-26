import { z } from 'zod';
import { AudioCategorySchema, AudioTriggerSchema, MixModeSchema } from './audio';

/** The voice that reads the script. One voice per script for now (AUDIO.md). */
export const ScriptVoiceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  model: z.string().min(1),
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
  /** File key in the pack, without extension. Template lines carry their slots. */
  key: z.string().min(1),
  slots: z.array(z.string()).optional(),
  /** French text read by the TTS. Slots appear as `{slot}`; templates are rendered on device for now. */
  text: z.string().min(1),
  /** The organizer's own sound for this line. When present, it is played and the text is not read. */
  audio: UploadedAudioSchema.optional(),
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
  /** Written by publishing only; the studio's saves keep whatever is stored. */
  published: PublishedMarkSchema.optional(),
});
export type AudioScript = z.infer<typeof AudioScriptSchema>;
export type AudioScriptInput = z.input<typeof AudioScriptSchema>;
