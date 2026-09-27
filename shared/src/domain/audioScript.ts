import { AudioEventSchema, AudioPackSchema } from '../schemas/audio';
import type { AudioEvent, AudioPack } from '../schemas/audio';
import { AudioScriptSchema, PersonalDefsSchema } from '../schemas/audioScript';
import type { AudioScript, AudioScriptInput, AudioUploadFormat, PersonalDefs, ScriptLine, ScriptVoice } from '../schemas/audioScript';
import { whenInWords } from './audioEditor';
import { supportsAudioTags, textForVoice } from './audioTags';
import { livePlaceholders, placeholdersIn, templatePhase, unknownPlaceholders } from './placeholders';
import type { PlaceholderPhase } from './placeholders';

/** The file a line becomes in the pack: `<key>.mp3` for the voice, the upload's own format otherwise. */
export const packFileKey = (line: Pick<ScriptLine, 'key' | 'audio'>): string => `${line.key}.${line.audio?.format ?? 'mp3'}`;

/** The file of a line's ambiance in the pack, beside the line's own: `<key>-under.<format>`. */
export const underFileKey = (line: Pick<ScriptLine, 'key' | 'under'>): string | null => (line.under ? `${line.key}-under.${line.under.format}` : null);

/**
 * Before personal lines, a line with `{slots}` was a caption-only template. It becomes a
 * personal template (its sentence moves to `personal.template`) whose offline version is still
 * to be written, so the studio asks for it and publishing waits for it. Idempotent.
 */
export const upgradeLine = (line: ScriptLine): ScriptLine => {
  const { slots, ...rest } = line;
  if (line.personal || line.audio || (placeholdersIn(line.text).length === 0 && !(slots && slots.length > 0))) return rest;
  return { ...rest, personal: { kind: 'template', template: line.text }, text: '' };
};

export const upgradeScript = <S extends Pick<AudioScript, 'lines'>>(script: S): S => ({ ...script, lines: script.lines.map(upgradeLine) });

/** When a personal line gets said: before the start (runner facts, the AI) or as it plays (the run's numbers). Null for a line said the same to everyone. */
export const personalPhase = (line: Pick<ScriptLine, 'personal'>): PlaceholderPhase | null =>
  !line.personal ? null : line.personal.kind === 'ai' ? 'prepare' : templatePhase(line.personal.template);

/**
 * Each line becomes a file event: the voice reading `text`, or the organizer's own file. A
 * personal line is the same file event (its offline version) marked `personal`, so an app that
 * predates personal lines still plays something.
 */
export const eventFor = (line: ScriptLine): AudioEvent => {
  const phase = personalPhase(line);
  return AudioEventSchema.parse({
    id: line.id,
    title: line.title,
    category: line.category,
    mix: line.mix,
    priority: line.priority,
    once: line.once,
    trigger: line.trigger,
    source: { kind: 'file', key: packFileKey(line) },
    ...(phase ? { personal: { phase } } : {}),
    ...(line.under ? { under: underFileKey(line) } : {}),
  });
};

export type BuiltScript = AudioScript & { events: AudioEvent[] };

/** Validates a script and derives its event list. Duplicate ids are a script bug, not a pack. */
export const buildScript = (script: AudioScriptInput): BuiltScript => {
  const parsed = upgradeScript(AudioScriptSchema.parse(script));
  const ids = parsed.lines.map((l) => l.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate event ids in script');
  return { ...parsed, events: parsed.lines.map(eventFor) };
};

/** Lines the voice reads the same to everyone (a personal line's offline version included): not the organizer's own files, not unwritten ones. */
export const renderableLines = (script: Pick<AudioScript, 'lines'>): ScriptLine[] => script.lines.filter((l) => !l.audio && l.text.trim().length > 0);

/** Lines that play the organizer's own sound file. */
export const uploadedLines = (script: AudioScript): ScriptLine[] => script.lines.filter((l) => l.audio !== undefined);

/** Pack file keys used by more than one line: publishing would write one over the other. */
export const duplicateFileKeys = (lines: ScriptLine[]): string[] => {
  const keys = lines.map(packFileKey);
  return [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
};

/**
 * What stops a line from going out as written, in codes the studio words:
 * - `no_text`: nothing to read, not even offline (a personal line needs its offline version);
 * - `placeholder_in_text`: braces in the text everyone hears, the voice would read "{prenom}";
 * - `unknown_placeholder`: a name the studio does not know, in the personal sentence;
 * - `live_before_start`: a value of the run (time, pace) in a line played before it has one.
 */
export type LineIssue =
  | { code: 'no_text' }
  | { code: 'placeholder_in_text'; names: string[] }
  | { code: 'unknown_placeholder'; names: string[] }
  | { code: 'live_before_start'; names: string[] };

const BEFORE_THE_RUN = new Set(['cue', 'start']);

export const lineIssues = (line: ScriptLine): LineIssue[] => {
  const inText = placeholdersIn(line.text);
  const template = line.personal?.kind === 'template' ? line.personal.template : '';
  const unknown = unknownPlaceholders(template);
  const live = BEFORE_THE_RUN.has(line.trigger.kind) ? livePlaceholders(template) : [];
  const issues: (LineIssue | null)[] = [
    !line.audio && line.text.trim().length === 0 ? { code: 'no_text' } : null,
    inText.length > 0 ? { code: 'placeholder_in_text', names: inText } : null,
    unknown.length > 0 ? { code: 'unknown_placeholder', names: unknown } : null,
    live.length > 0 ? { code: 'live_before_start', names: live } : null,
  ];
  return issues.filter((i): i is LineIssue => i !== null);
};

/** The personal lines of a built script, as the Worker keeps them beside the published pack. */
export const personalDefsFor = (script: BuiltScript): PersonalDefs =>
  PersonalDefsSchema.parse({
    courseId: script.courseId,
    version: script.version,
    locale: script.locale,
    voice: script.voice,
    lines: script.lines
      .filter((l) => l.personal)
      .map((l) => ({
        eventId: l.id,
        title: l.title,
        when: whenInWords(l.trigger),
        phase: personalPhase(l),
        personal: l.personal,
        fallback: l.text,
        finish: l.trigger.kind === 'finish',
      })),
  });

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
 * What a voice is asked to read and what its render is cached under: the text as that model
 * takes it (tags only for v3), the voice, the model, and the stability when one was chosen.
 * A script without a stability keeps the keys of every render made before voices had settings.
 */
export const voiceCacheInput = (voice: ScriptVoice, text: string): string =>
  `${ttsCacheInput(textForVoice(voice, text), voice.id, voice.model)}${voice.stability === undefined ? '' : `|s${voice.stability}`}`;

/**
 * The ElevenLabs text-to-speech body for a line, the same from the Worker and the CLI. v3 gets
 * the language and its stability (0.5, "natural", unless the organizer chose); older models
 * keep the settings every render before v3 was made with.
 */
export const ttsRequestBody = (voice: ScriptVoice, text: string, locale: 'fr' | 'en' = 'fr'): Record<string, unknown> =>
  supportsAudioTags(voice.model)
    ? { text: textForVoice(voice, text), model_id: voice.model, language_code: locale, voice_settings: { stability: voice.stability ?? 0.5, similarity_boost: 0.75 } }
    : { text: textForVoice(voice, text), model_id: voice.model, voice_settings: { stability: voice.stability ?? 0.5, similarity_boost: 0.75, style: 0.3 } };

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
