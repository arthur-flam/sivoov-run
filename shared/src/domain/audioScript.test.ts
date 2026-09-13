import { describe, expect, it } from 'vitest';
import { AudioPackSchema } from '../schemas/audio';
import { AudioScriptSchema } from '../schemas/audioScript';
import type { AudioScriptInput, ScriptLineInput } from '../schemas/audioScript';
import { buildScript, eventFor, manifestFor, packPrefix, renderableLines, ttsCacheInput } from './audioScript';

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
