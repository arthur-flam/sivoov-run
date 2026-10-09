import { describe, expect, it } from 'vitest';
import { AudioPackSchema } from '../schemas/audio';
import { AudioScriptSchema } from '../schemas/audioScript';
import type { AudioScriptInput, ScriptLineInput } from '../schemas/audioScript';
import {
  buildScript,
  duplicateFileKeys,
  eventFor,
  lineIssues,
  manifestFor,
  personalDefsFor,
  packFileKey,
  packPrefix,
  publishedContent,
  renderableLines,
  sniffAudioFormat,
  spokenTexts,
  ttsCacheInput,
  upgradeLine,
  voiceCacheInput,
  withLineVoice,
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
  it('rejects an unknown trigger kind and a bad priority', () => {
    expect(AudioScriptSchema.safeParse(script([line({ trigger: { kind: 'nowhere' } as never })])).success).toBe(false);
    expect(AudioScriptSchema.safeParse(script([line({ priority: 42 })])).success).toBe(false);
  });

  it('keeps a line whose text is not written yet as a draft, which lineIssues flags', () => {
    const parsed = AudioScriptSchema.parse(script([line({ text: '' })]));
    expect(lineIssues(parsed.lines[0]!)).toEqual([{ code: 'no_text' }]);
  });
});

describe('eventFor', () => {
  it('makes a file event out of a plain line', () => {
    const plain = eventFor(AudioScriptSchema.parse(script([line()])).lines[0]!);
    expect(plain.source).toEqual({ kind: 'file', key: 'landmark-planches.mp3' });
    expect(plain.title).toBe('Les Planches');
    expect(plain.personal).toBeUndefined();
  });

  it('plays a personal line from its offline file, marked with when the runner’s version is made', () => {
    const [welcome, split] = AudioScriptSchema.parse(
      script([
        line({ id: 'ceremony.call', key: 'call', text: 'Coureurs, sur la ligne.', personal: { kind: 'template', template: 'Dossard {dossard}, {prenom} {nom}.' } }),
        line({ id: 'personal.split', key: 'split', text: 'Un kilomètre de plus.', personal: { kind: 'template', template: 'Kilomètre {km}, {temps_km}.' } }),
      ]),
    ).lines;
    expect(eventFor(welcome!)).toMatchObject({ source: { kind: 'file', key: 'call.mp3' }, personal: { phase: 'prepare' } });
    expect(eventFor(split!)).toMatchObject({ source: { kind: 'file', key: 'split.mp3' }, personal: { phase: 'live' } });
    const ai = AudioScriptSchema.parse(script([line({ text: 'Bienvenue.', personal: { kind: 'ai', prompt: 'Accueille le coureur par son prénom.' } })])).lines[0]!;
    expect(eventFor(ai).personal).toEqual({ phase: 'prepare' });
  });

  it('carries the words the runner reads on screen, without the voice tags, and never how a personal line is made', () => {
    const [tagged, personal, silent] = AudioScriptSchema.parse(
      script([
        line({ id: 'a', key: 'a', text: '[excited] Les Planches,  à votre gauche !' }),
        line({ id: 'b', key: 'b', text: 'Coureurs, sur la ligne.', personal: { kind: 'template', template: 'Dossard {dossard}, {prenom}.' } }),
        line({ id: 'c', key: 'c', text: '   ' }),
      ]),
    ).lines;
    expect(eventFor(tagged!).caption).toBe('Les Planches, à votre gauche !');
    expect(eventFor(personal!).caption).toBe('Coureurs, sur la ligne.');
    expect(JSON.stringify(eventFor(personal!))).not.toContain('{dossard}');
    expect(eventFor(silent!).caption).toBeUndefined();
  });
});

describe('upgradeLine', () => {
  it('turns a caption-only template of an older script into a personal line waiting for its offline version', () => {
    const old = AudioScriptSchema.parse(script([line({ key: 'split', slots: ['km', 'splitTime'], text: 'Kilomètre {km}, {splitTime}.' })])).lines[0]!;
    const upgraded = upgradeLine(old);
    expect(upgraded.personal).toEqual({ kind: 'template', template: 'Kilomètre {km}, {splitTime}.' });
    expect(upgraded.text).toBe('');
    expect(upgraded.slots).toBeUndefined();
    expect(upgradeLine(upgraded)).toEqual(upgraded);
    expect(upgradeLine(AudioScriptSchema.parse(script([line()])).lines[0]!)).toEqual(AudioScriptSchema.parse(script([line()])).lines[0]);
  });
});

describe('lineIssues', () => {
  const parsed = (over: Partial<ScriptLineInput>) => AudioScriptSchema.parse(script([line(over)])).lines[0]!;
  it('says what stops a line from going out', () => {
    expect(lineIssues(parsed({}))).toEqual([]);
    expect(lineIssues(parsed({ text: 'Bravo {prenom} !' }))).toEqual([{ code: 'placeholder_in_text', names: ['prenom'] }]);
    expect(lineIssues(parsed({ personal: { kind: 'template', template: 'Bravo {prenon} !' } }))).toEqual([{ code: 'unknown_placeholder', names: ['prenon'] }]);
    expect(lineIssues(parsed({ trigger: { kind: 'cue', at: 'armed', order: 1 }, personal: { kind: 'template', template: 'Déjà {temps} ?' } }))).toEqual([
      { code: 'live_before_start', names: ['temps'] },
    ]);
    expect(lineIssues(parsed({ text: '', audio: { kind: 'upload', hash: 'a'.repeat(64), format: 'mp3', bytes: 10, name: 'x.mp3' } }))).toEqual([]);
  });
});

describe('personalDefsFor', () => {
  it('keeps what the Worker needs to say each personal line to each runner', () => {
    const built = buildScript(
      script([
        line(),
        line({ id: 'ceremony.finish', key: 'finish', trigger: { kind: 'finish' }, text: 'Vous êtes arrivé.', personal: { kind: 'template', template: '{prenom}, {temps} !' } }),
      ]),
    );
    expect(personalDefsFor(built).lines).toEqual([
      { eventId: 'ceremony.finish', title: 'Les Planches', when: 'À l’arrivée', phase: 'live', personal: { kind: 'template', template: '{prenom}, {temps} !' }, fallback: 'Vous êtes arrivé.', finish: true },
    ]);
  });
});

describe('voiceCacheInput', () => {
  it('keys a render by what the model actually reads, and keeps older keys when no stability was chosen', () => {
    const v2 = { id: 'v', name: 'George', model: 'eleven_multilingual_v2' };
    expect(voiceCacheInput(v2, 'Partez !')).toBe(ttsCacheInput('Partez !', 'v', 'eleven_multilingual_v2'));
    expect(voiceCacheInput(v2, '[excited] Partez !')).toBe(ttsCacheInput('Partez !', 'v', 'eleven_multilingual_v2'));
    expect(voiceCacheInput({ ...v2, model: 'eleven_v3' }, '[excited] Partez !')).toBe('[excited] Partez !|v|eleven_v3');
    expect(voiceCacheInput({ ...v2, model: 'eleven_v3', stability: 0.3 }, 'Partez !')).toBe('Partez !|v|eleven_v3|s0.3');
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

describe('a line with takes', () => {
  const cheers = line({
    id: 'crowd.cheers',
    title: 'La foule',
    category: 'personal',
    trigger: { kind: 'filler' },
    key: 'crowd-cheers',
    text: 'Allez !',
    voice: { id: 'Fenrir', direction: 'Un supporter au bord de la route.' },
    takes: [
      { id: 'a', text: 'Allez, allez !', personal: { kind: 'template', template: 'Allez {prenom} !' } },
      { id: 'b', text: 'Ça monte, continuez !', when: 'restart' },
      { id: 'c', text: 'Kilomètre de plus.', personal: { kind: 'template', template: 'Kilomètre {km}, {prenom} !' } },
    ],
  });

  it('lists every take in the pack with its own file, words, condition and when its personal version is made', () => {
    const event = eventFor(AudioScriptSchema.parse(script([cheers])).lines[0]!, 'wav');
    expect(event.trigger).toEqual({ kind: 'filler' });
    expect(event.source).toEqual({ kind: 'file', key: 'crowd-cheers.wav' });
    expect(event.takes).toEqual([
      { id: 'a', key: 'crowd-cheers~a.wav', caption: 'Allez, allez !', personal: { phase: 'prepare' } },
      { id: 'b', key: 'crowd-cheers~b.wav', caption: 'Ça monte, continuez !', when: 'restart' },
      { id: 'c', key: 'crowd-cheers~c.wav', caption: 'Kilomètre de plus.', personal: { phase: 'live' } },
    ]);
  });

  it('checks each take like a line, and says which take', () => {
    const parsed = AudioScriptSchema.parse(script([{ ...cheers, takes: [{ id: 'a', text: '' }, { id: 'b', text: 'Bravo {prenom}' }] }])).lines[0]!;
    expect(lineIssues(parsed)).toEqual([
      { code: 'no_text', take: 'a' },
      { code: 'placeholder_in_text', names: ['prenom'], take: 'b' },
    ]);
  });

  it('gives the Worker each personal take, with the line’s own voice', () => {
    const defs = personalDefsFor(buildScript(script([cheers])));
    expect(defs.lines.map((d) => [d.eventId, d.takeId, d.phase, d.voice?.id, d.fallback])).toEqual([
      ['crowd.cheers', 'a', 'prepare', 'Fenrir', 'Allez, allez !'],
      ['crowd.cheers', 'c', 'live', 'Fenrir', 'Kilomètre de plus.'],
    ]);
  });

  it('has every take read by the line’s voice before publishing, and finds two takes that would share a file', () => {
    const texts = spokenTexts(AudioScriptSchema.parse(script([cheers, line()])));
    expect(texts.map((t) => [t.line.id, t.takeId ?? null, t.voice.id])).toEqual([
      ['crowd.cheers', null, 'Fenrir'],
      ['crowd.cheers', 'a', 'Fenrir'],
      ['crowd.cheers', 'b', 'Fenrir'],
      ['crowd.cheers', 'c', 'Fenrir'],
      ['course.planches', null, 'JBFqnCBsd6RMkjVDRZzb'],
    ]);
    const clash = AudioScriptSchema.parse(script([cheers, line({ id: 'other', key: 'crowd-cheers~a' })])).lines;
    expect(duplicateFileKeys(clash)).toEqual(['crowd-cheers~a.mp3']);
  });

  it('refuses two takes of a line with the same id', () => {
    expect(() => buildScript(script([{ ...cheers, takes: [{ id: 'a', text: 'Un' }, { id: 'a', text: 'Deux' }] }]))).toThrow(/take/);
  });

  it('carries the course’s quiet limit and each file’s length into the manifest', () => {
    const built = buildScript({ ...script([line()]), maxGapS: 120 });
    const pack = manifestFor(built, [{ key: 'landmark-planches.mp3', bytes: 10, sha256: 'ab', seconds: 2.5 }]);
    expect(pack.maxGapS).toBe(120);
    expect(pack.files['landmark-planches.mp3']?.seconds).toBe(2.5);
  });
});

describe('withLineVoice', () => {
  it('lets a line be said by another voice or in another register, and keys its renders apart', () => {
    const speaker = { id: 'Sadachbia', name: 'Le speaker', model: 'gemini-3.8-flash-tts', direction: 'Le speaker, dans l’oreille.' };
    const onPa = withLineVoice(speaker, { id: 'Sadachbia', direction: 'Le speaker, sur la sono.', scene: 'Sur la sono du départ.' });
    expect(onPa).toEqual({ ...speaker, direction: 'Le speaker, sur la sono.', scene: 'Sur la sono du départ.' });
    expect(withLineVoice(speaker, { id: 'Puck', direction: 'Un supporter.' }).name).toBe('Puck');
    expect(withLineVoice(speaker)).toBe(speaker);
    expect(voiceCacheInput(onPa, 'Partez !')).not.toBe(voiceCacheInput({ ...onPa, scene: undefined }, 'Partez !'));
  });
});
