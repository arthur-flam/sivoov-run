import { AudioEventSchema, AudioPackSchema } from '../schemas/audio';
import type { AudioEvent, AudioPack } from '../schemas/audio';
import { AudioScriptSchema } from '../schemas/audioScript';
import type { AudioScript, AudioScriptInput, ScriptLine } from '../schemas/audioScript';

/** Each line becomes an AudioEvent; templates stay templates, everything else is a file. */
export const eventFor = (line: ScriptLine): AudioEvent =>
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

export type BuiltScript = AudioScript & { events: AudioEvent[] };

/** Validates a script and derives its event list. Duplicate ids are a script bug, not a pack. */
export const buildScript = (script: AudioScriptInput): BuiltScript => {
  const parsed = AudioScriptSchema.parse(script);
  const ids = parsed.lines.map((l) => l.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate event ids in script');
  return { ...parsed, events: parsed.lines.map(eventFor) };
};

/** Lines the TTS has to read. Template lines are rendered per slot value on the device. */
export const renderableLines = (script: AudioScript): ScriptLine[] => script.lines.filter((l) => !l.slots);

export const packPrefix = (courseId: string, version: number): string => `packs/${courseId}/${version}`;

export type RenderedFile = { key: string; bytes: number; sha256: string };

/** The manifest the API stores: file urls are R2 keys, resolved per environment at serve time. */
export const manifestFor = (script: BuiltScript, rendered: RenderedFile[]): AudioPack =>
  AudioPackSchema.parse({
    courseId: script.courseId,
    version: script.version,
    locale: script.locale,
    events: script.events,
    files: Object.fromEntries(
      rendered.map((r) => [r.key, { url: `${packPrefix(script.courseId, script.version)}/${r.key}`, bytes: r.bytes, sha256: r.sha256 }]),
    ),
  });

/** The cache key of a rendered line: same rule in the Worker and in the CLI. */
export const ttsCacheInput = (text: string, voiceId: string, model: string): string => `${text}|${voiceId}|${model}`;
