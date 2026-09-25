import { AudioEventSchema, AudioPackSchema } from '../schemas/audio';
import type { AudioEvent, AudioPack } from '../schemas/audio';
import { AudioScriptSchema } from '../schemas/audioScript';
import type { AudioScript, AudioScriptInput, AudioUploadFormat, ScriptLine } from '../schemas/audioScript';

/** The file a line becomes in the pack: `<key>.mp3` for the voice, the upload's own format otherwise. */
export const packFileKey = (line: Pick<ScriptLine, 'key' | 'audio'>): string => `${line.key}.${line.audio?.format ?? 'mp3'}`;

/**
 * Each line becomes an AudioEvent. A line with its own sound file is a file event whatever
 * else it says; a line with slots stays a template; everything else is the rendered voice.
 */
export const eventFor = (line: ScriptLine): AudioEvent =>
  AudioEventSchema.parse({
    id: line.id,
    title: line.title,
    category: line.category,
    mix: line.mix,
    priority: line.priority,
    once: line.once,
    trigger: line.trigger,
    source: line.slots && !line.audio ? { kind: 'template', key: line.key, slots: line.slots } : { kind: 'file', key: packFileKey(line) },
  });

export type BuiltScript = AudioScript & { events: AudioEvent[] };

/** Validates a script and derives its event list. Duplicate ids are a script bug, not a pack. */
export const buildScript = (script: AudioScriptInput): BuiltScript => {
  const parsed = AudioScriptSchema.parse(script);
  const ids = parsed.lines.map((l) => l.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate event ids in script');
  return { ...parsed, events: parsed.lines.map(eventFor) };
};

/** Lines the TTS has to read: not templates (rendered on the device) and not the organizer's own files. */
export const renderableLines = (script: AudioScript): ScriptLine[] => script.lines.filter((l) => !l.slots && !l.audio);

/** Lines that play the organizer's own sound file. */
export const uploadedLines = (script: AudioScript): ScriptLine[] => script.lines.filter((l) => l.audio !== undefined);

/** Pack file keys used by more than one line: publishing would write one over the other. */
export const duplicateFileKeys = (lines: ScriptLine[]): string[] => {
  const keys = lines.filter((l) => !l.slots || l.audio).map(packFileKey);
  return [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
};

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

/**
 * Everything a published pack depends on, as one canonical string: the voice and every line
 * (text, trigger, files). Hash it to tell whether a draft differs from what was published.
 */
export const publishedContent = (script: Pick<AudioScript, 'voice' | 'lines'>): string => JSON.stringify({ voice: script.voice, lines: script.lines });

export const AUDIO_CONTENT_TYPES: Record<AudioUploadFormat, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' };

const ascii = (bytes: Uint8Array, from: number, length: number): string => String.fromCharCode(...bytes.slice(from, from + length));

/**
 * What kind of sound a file really is, from its first bytes (the browser's type and the file
 * name are not trusted): MP3 (an ID3 tag or an MPEG layer III frame), M4A (an `ftyp` box) or
 * WAV (RIFF/WAVE). Anything else is null.
 */
export const sniffAudioFormat = (bytes: Uint8Array): AudioUploadFormat | null => {
  if (bytes.length < 12) return null;
  if (ascii(bytes, 0, 3) === 'ID3') return 'mp3';
  const b0 = bytes[0]!;
  const b1 = bytes[1]!;
  // MPEG audio frame sync (11 bits) with a real layer; ADTS AAC shares the sync but has layer 00.
  if (b0 === 0xff && (b1 & 0xe0) === 0xe0 && ((b1 >> 1) & 0x3) !== 0) return 'mp3';
  if (ascii(bytes, 4, 4) === 'ftyp') return 'm4a';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'wav';
  return null;
};
