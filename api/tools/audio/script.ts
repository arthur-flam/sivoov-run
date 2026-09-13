/**
 * Script -> script.json. A script is the AudioPack event list plus the text to read for each
 * event and the voice to read it with. `npx tsx tools/audio/script.ts <courseId>` writes
 * `.cache/audio/<courseId>/script.json` and prints it; the build runs it in-process.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { AudioCategorySchema, AudioEventSchema, AudioTriggerSchema, MixModeSchema } from '@sivoov/shared';
import type { AudioEvent } from '@sivoov/shared';

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
export type ScriptLine = z.input<typeof ScriptLineSchema>;

export const AudioScriptSchema = z.object({
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  locale: z.enum(['fr', 'en']).default('fr'),
  voice: z.object({ id: z.string().min(1), name: z.string(), model: z.string().min(1) }),
  lines: z.array(ScriptLineSchema),
});
export type AudioScript = z.input<typeof AudioScriptSchema>;

/** Each line becomes an AudioEvent; templates stay templates, everything else is a file. */
export const eventFor = (line: z.infer<typeof ScriptLineSchema>): AudioEvent =>
  AudioEventSchema.parse({
    id: line.id,
    title: line.title,
    category: line.category,
    mix: line.mix,
    priority: line.priority,
    once: line.once,
    trigger: line.trigger,
    source: line.slots ? { kind: 'template', key: line.key, slots: line.slots } : { kind: 'file', key: `${line.key}.mp3` },
  });

export const buildScript = (script: AudioScript) => {
  const parsed = AudioScriptSchema.parse(script);
  const ids = parsed.lines.map((l) => l.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate event ids in script');
  return { ...parsed, events: parsed.lines.map(eventFor) };
};
export type BuiltScript = ReturnType<typeof buildScript>;

export const scripts: Record<string, () => Promise<AudioScript>> = {
  'deauville-2026-marathon': () => import('./scripts/deauville-2026-marathon').then((m) => m.deauville2026MarathonScript),
};

export const loadScript = async (courseId: string): Promise<BuiltScript> => {
  const load = scripts[courseId];
  if (!load) throw new Error(`no script for course ${courseId}; known: ${Object.keys(scripts).join(', ')}`);
  return buildScript(await load());
};

export const cacheDir = (courseId: string) => new URL(`../../.cache/audio/${courseId}/`, import.meta.url).pathname;

if (process.argv[1]?.endsWith('script.ts')) {
  const courseId = process.argv[2] ?? 'deauville-2026-marathon';
  const built = await loadScript(courseId);
  mkdirSync(cacheDir(courseId), { recursive: true });
  writeFileSync(`${cacheDir(courseId)}script.json`, JSON.stringify(built, null, 2));
  console.log(JSON.stringify(built, null, 2));
}
