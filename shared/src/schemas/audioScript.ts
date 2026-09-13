import { z } from 'zod';
import { AudioCategorySchema, AudioTriggerSchema, MixModeSchema } from './audio';

/** The voice that reads the script. One voice per script for now (AUDIO.md). */
export const ScriptVoiceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  model: z.string().min(1),
});
export type ScriptVoice = z.infer<typeof ScriptVoiceSchema>;

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
});
export type ScriptLine = z.infer<typeof ScriptLineSchema>;
export type ScriptLineInput = z.input<typeof ScriptLineSchema>;

/** The draft for one (course, locale). `version` is the version the next publish produces. */
export const AudioScriptSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  locale: z.enum(['fr', 'en']).default('fr'),
  voice: ScriptVoiceSchema,
  lines: z.array(ScriptLineSchema),
});
export type AudioScript = z.infer<typeof AudioScriptSchema>;
export type AudioScriptInput = z.input<typeof AudioScriptSchema>;
