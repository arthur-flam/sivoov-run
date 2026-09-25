import { describe, expect, it } from 'vitest';
import { AudioPackSchema } from '../schemas/audio';
import { AudioScriptSchema } from '../schemas/audioScript';
import type { AudioScriptInput, ScriptLineInput } from '../schemas/audioScript';
import {
  buildScript,
  duplicateFileKeys,
  eventFor,
  manifestFor,
  packFileKey,
  packPrefix,
  publishedContent,
  renderableLines,
  sniffAudioFormat,
  ttsCacheInput,
  uploadedLines,
} from './audioScript';

const line = (over: Partial<ScriptLineInput> = {}): ScriptLineInput => ({
  id: 'course.planches',
  title: 'Les Planches',
  category: 'course',
  mix: 'duck',
  priority: 6,
  trigger: { kind: 'distance', meters: 200 },
  key: 'landmark-planches',
  text: 'Vous êtes sur les Planches.',
  ...over,
});

const script = (lines: ScriptLineInput[]): AudioScriptInput => ({
  courseId: 'deauville-2026-marathon',
  version: 2,
  locale: 'fr',
  voice: { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', model: 'eleven_multilingual_v2' },
  lines,
});

describe('AudioScriptSchema', () => {
  it('defaults once to true and the locale to fr', () => {
    const parsed = AudioScriptSchema.parse(script([line()]));
    expect(parsed.locale).toBe('fr');
    expect(parsed.lines[0]?.once).toBe(true);
  });
  it('rejects an unknown trigger kind, an empty text and a bad priority', () => {
    expect(AudioScriptSchema.safeParse(script([line({ trigger: { kind: 'nowhere' } as never })])).success).toBe(false);
    expect(AudioScriptSchema.safeParse(script([line({ text: '' })])).success).toBe(false);
    expect(AudioScriptSchema.safeParse(script([line({ priority: 42 })])).success).toBe(false);
  });
});

describe('eventFor', () => {
  it('makes a file event out of a plain line and a template event out of a slotted one', () => {
    const plain = eventFor(AudioScriptSchema.parse(script([line()])).lines[0]!);
    expect(plain.source).toEqual({ kind: 'file', key: 'landmark-planches.mp3' });
    expect(plain.title).toBe('Les Planches');
    const template = eventFor(AudioScriptSchema.parse(script([line({ key: 'split', slots: ['km', 'splitTime'] })])).lines[0]!);
    expect(template.source).toEqual({ kind: 'template', key: 'split', slots: ['km', 'splitTime'] });
  });
});

describe('buildScript', () => {
  it('derives one event per line and refuses duplicate ids', () => {
    const built = buildScript(script([line(), line({ id: 'ceremony.gun', key: 'gun', trigger: { kind: 'start' } })]));
    expect(built.events.map((e) => e.id)).toEqual(['course.planches', 'ceremony.gun']);
    expect(() => buildScript(script([line(), line()]))).toThrow(/duplicate/);
  });
  it('lists only the lines the TTS renders', () => {
    const built = buildScript(script([line(), line({ id: 'personal.split', key: 'split', slots: ['km'] })]));
    expect(renderableLines(built).map((l) => l.id)).toEqual(['course.planches']);
  });
});

describe('manifestFor', () => {
  it('builds a valid pack whose file urls are R2 keys under the version prefix', () => {
    const built = buildScript(script([line()]));
    const pack = manifestFor(built, [{ key: 'landmark-planches.mp3', bytes: 1234, sha256: 'abc' }]);
    expect(AudioPackSchema.safeParse(pack).success).toBe(true);
    expect(packPrefix(built.courseId, built.version)).toBe('packs/deauville-2026-marathon/2');
    expect(pack.files['landmark-planches.mp3']?.url).toBe('packs/deauville-2026-marathon/2/landmark-planches.mp3');
    expect(pack.version).toBe(2);
  });
});

describe('ttsCacheInput', () => {
  it('keys on the text, the voice and the model together', () => {
    expect(ttsCacheInput('bonjour', 'v1', 'm1')).toBe('bonjour|v1|m1');
    expect(ttsCacheInput('bonjour', 'v2', 'm1')).not.toBe(ttsCacheInput('bonjour', 'v1', 'm1'));
  });
});

const HASH = 'a'.repeat(64);
const upload = { kind: 'upload' as const, hash: HASH, format: 'mp3' as const, bytes: 48_000, name: 'cloche.mp3' };

describe('a line with the organizer’s own sound file', () => {
  it('becomes a file event with the file’s format, even if it had slots', () => {
    const [plain, wav, slotted] = AudioScriptSchema.parse(
      script([
        line({ audio: upload }),
        line({ id: 'course.bell', key: 'bell', audio: { ...upload, format: 'wav' } }),
        line({ id: 'personal.split', key: 'split', slots: ['km'], audio: upload }),
      ]),
    ).lines;
    expect(eventFor(plain!).source).toEqual({ kind: 'file', key: 'landmark-planches.mp3' });
    expect(eventFor(wav!).source).toEqual({ kind: 'file', key: 'bell.wav' });
    expect(eventFor(slotted!).source).toEqual({ kind: 'file', key: 'split.mp3' });
    expect(packFileKey(wav!)).toBe('bell.wav');
  });

  it('is not read by the voice', () => {
    const built = buildScript(script([line(), line({ id: 'course.bell', key: 'bell', audio: upload })]));
    expect(renderableLines(built).map((l) => l.id)).toEqual(['course.planches']);
    expect(uploadedLines(built).map((l) => l.id)).toEqual(['course.bell']);
  });

  it('refuses a hash that is not a sha256, a file over 5 MB and an unknown format', () => {
    expect(AudioScriptSchema.safeParse(script([line({ audio: { ...upload, hash: 'abc' } })])).success).toBe(false);
    expect(AudioScriptSchema.safeParse(script([line({ audio: { ...upload, bytes: 6 * 1024 * 1024 } })])).success).toBe(false);
    expect(AudioScriptSchema.safeParse(script([line({ audio: { ...upload, format: 'ogg' as never } })])).success).toBe(false);
  });
});

describe('duplicateFileKeys', () => {
  it('finds two lines that would write the same file in the pack', () => {
    const lines = AudioScriptSchema.parse(script([line(), line({ id: 'course.other' }), line({ id: 'personal.split', key: 'split', slots: ['km'] })])).lines;
    expect(duplicateFileKeys(lines)).toEqual(['landmark-planches.mp3']);
    expect(duplicateFileKeys(lines.slice(1))).toEqual([]);
  });
});

describe('publishedContent', () => {
  it('changes with the text, the trigger, the file or the voice, and nothing else', () => {
    const base = AudioScriptSchema.parse(script([line()]));
    const same = AudioScriptSchema.parse({ ...script([line()]), version: 7 });
    expect(publishedContent(same)).toBe(publishedContent(base));
    const changes = [
      script([line({ text: 'Autre texte.' })]),
      script([line({ trigger: { kind: 'distance', meters: 300 } })]),
      script([line({ audio: upload })]),
      { ...script([line()]), voice: { id: 'other', name: 'Autre', model: 'eleven_multilingual_v2' } },
    ];
    changes.forEach((s) => expect(publishedContent(AudioScriptSchema.parse(s))).not.toBe(publishedContent(base)));
  });
});

describe('sniffAudioFormat', () => {
  const bytes = (head: number[] | string) => {
    const start = typeof head === 'string' ? Array.from(head, (c) => c.charCodeAt(0)) : head;
    return new Uint8Array([...start, ...new Array(16).fill(0)]);
  };
  it('recognises MP3, M4A and WAV from their first bytes', () => {
    expect(sniffAudioFormat(bytes('ID3'))).toBe('mp3');
    expect(sniffAudioFormat(bytes([0xff, 0xfb, 0x90, 0x64]))).toBe('mp3');
    expect(sniffAudioFormat(bytes([0, 0, 0, 0x20, ...Array.from('ftypM4A ', (c) => c.charCodeAt(0))]))).toBe('m4a');
    expect(sniffAudioFormat(bytes('RIFF\x24\x08\x00\x00WAVE'))).toBe('wav');
  });
  it('refuses anything else, including AAC without a container and a text file named .mp3', () => {
    expect(sniffAudioFormat(bytes([0xff, 0xf1, 0x50, 0x80]))).toBeNull();
    expect(sniffAudioFormat(bytes('<html><body>'))).toBeNull();
    expect(sniffAudioFormat(new Uint8Array([0x49, 0x44]))).toBeNull();
  });
});
