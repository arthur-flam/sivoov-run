import { describe, expect, it } from 'vitest';
import { AudioPackSchema } from '../schemas/audio';
import type { AudioPack } from '../schemas/audio';
import { CLEAR_AHEAD_S, MAX_GAP_S, fillerNeed, hearRun } from './rhythm';
import type { Heard, RunPlan } from './rhythm';

const file = (seconds: number) => ({ url: 'x', bytes: 1, sha256: 'x', seconds });
const letters = 'abcdefghijkl'.split('');

/** A 10 km course with the Champs-Élysées' places, a split every km, two pools of fillers. */
const pack = (over: Partial<AudioPack> = {}): AudioPack =>
  AudioPackSchema.parse({
    courseId: 'c',
    version: 1,
    events: [
      { id: 'gun', category: 'ceremony', trigger: { kind: 'cue', at: 'gun', order: 1 }, source: { kind: 'file', key: 'gun.mp3' }, under: 'gun-under.mp3' },
      ...[250, 650, 2100, 3300, 5950, 6900, 9000].map((m) => ({ id: `at${m}`, category: 'course', priority: 6, trigger: { kind: 'distance', meters: m }, source: { kind: 'file', key: `at${m}.mp3` } })),
      { id: 'split', category: 'personal', priority: 4, once: false, trigger: { kind: 'split', everyMeters: 1000 }, source: { kind: 'file', key: 'split.mp3' } },
      { id: 'finish', category: 'ceremony', priority: 10, trigger: { kind: 'finish' }, source: { kind: 'file', key: 'finish.mp3' } },
      {
        id: 'crowd',
        category: 'personal',
        priority: 3,
        trigger: { kind: 'filler' },
        source: { kind: 'file', key: 'crowd.mp3' },
        under: 'crowd-under.mp3',
        takes: [...letters.map((l) => ({ id: l, key: `crowd~${l}.mp3` })), { id: 'again', key: 'crowd~again.mp3', when: 'restart' }],
      },
      { id: 'speaker', category: 'coaching', priority: 3, trigger: { kind: 'filler' }, source: { kind: 'file', key: 'speaker.mp3' }, takes: letters.slice(0, 6).map((l) => ({ id: l, key: `speaker~${l}.mp3` })) },
    ],
    files: {
      'gun.mp3': file(2),
      'gun-under.mp3': file(70),
      ...Object.fromEntries([250, 650, 2100, 3300, 5950, 6900, 9000].map((m) => [`at${m}.mp3`, file(9)])),
      'split.mp3': file(4),
      'finish.mp3': file(8),
      'crowd.mp3': file(3),
      'crowd-under.mp3': file(6),
      ...Object.fromEntries(letters.map((l) => [`crowd~${l}.mp3`, file(3)])),
      'crowd~again.mp3': file(3),
      'speaker.mp3': file(5),
      ...Object.fromEntries(letters.slice(0, 6).map((l) => [`speaker~${l}.mp3`, file(5)])),
    },
    ...over,
  });

/** The quiet stretches of a run while the runner runs: from the end of one sound to the start of the next. */
const silences = (p: AudioPack, heard: Heard[], slow: (s: number) => boolean = () => false) => {
  const seconds = (key?: string) => (key ? (p.files[key]?.seconds ?? 0) : 0);
  let end = 70; // the gun's ambiance
  return heard.flatMap((h) => {
    const start = h.elapsedMs / 1000;
    const quiet = { from: end, to: start };
    end = Math.max(end, start + Math.max(h.seconds, seconds(h.under)));
    return quiet.to > quiet.from && !slow(quiet.from) && !slow(quiet.to) ? [quiet.to - quiet.from] : [];
  });
};

const isFiller = (h: Heard) => h.eventId === 'crowd' || h.eventId === 'speaker';

describe('the rhythm director', () => {
  it.each([240, 300, 360, 420, 480])('never leaves the race quiet longer than the course allows, at %i s/km', (pace) => {
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: pace });
    expect(Math.max(...silences(pack(), heard))).toBeLessThanOrEqual(MAX_GAP_S + 1);
    expect(heard.some(isFiller)).toBe(true);
    expect(heard[heard.length - 1]!.eventId).toBe('finish');
  });

  it('keeps clear of the next placed line', () => {
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: 330 });
    heard.forEach((h, i) => {
      const next = heard.slice(i + 1).find((n) => !isFiller(n));
      if (isFiller(h) && next) expect(next.elapsedMs - h.elapsedMs).toBeGreaterThan((CLEAR_AHEAD_S - 1) * 1000);
    });
  });

  it('follows the course’s own limit', () => {
    const p = pack({ maxGapS: 90 });
    expect(Math.max(...silences(p, hearRun(p, 10_000, { paceSecPerKm: 360 })))).toBeLessThanOrEqual(91);
  });

  it('goes round each pool before saying anything twice, and alternates the pools', () => {
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: 480 }).filter(isFiller);
    const crowd = heard.filter((h) => h.eventId === 'crowd').map((h) => h.take ?? '');
    expect(new Set(crowd.slice(0, 13)).size).toBe(Math.min(13, crowd.length));
    expect(heard.slice(0, 4).map((h) => h.eventId)).toEqual(['crowd', 'speaker', 'crowd', 'speaker']);
  });

  it('stays quiet while the runner stands, and says a restart word once they run again', () => {
    const plan: RunPlan = { paceSecPerKm: 330, stops: [{ atM: 4000, seconds: 90 }] };
    const heard = hearRun(pack(), 10_000, plan);
    const stopAt = (heard.find((h) => h.distanceM >= 4000)?.elapsedMs ?? 0) / 1000;
    const restart = heard.find((h) => h.take === 'again')!;
    expect(restart).toBeDefined();
    expect(restart.distanceM).toBeGreaterThan(4000);
    expect(heard.filter((h) => h.take === 'again')).toHaveLength(1);
    expect(heard.filter((h) => isFiller(h) && h.distanceM >= 4000 && h.distanceM < 4001 && h.take !== 'again')).toEqual([]);
    expect(stopAt).toBeGreaterThan(0);
  });

  it('gives a walk the same restart word', () => {
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: 330, walks: [{ atM: 7500, seconds: 60 }] });
    expect(heard.filter((h) => h.take === 'again')).toHaveLength(1);
  });
});

describe('fillerNeed', () => {
  const base = { moving: true, restart: false, maxGapS: 150 };
  it('waits while the next placed line will come in time', () => {
    expect(fillerNeed({ ...base, quietS: 100, toNextS: 45 })).toBeNull();
  });
  it('cuts a long silence in two, never later than 40 s before the maximum', () => {
    expect(fillerNeed({ ...base, quietS: 99, toNextS: 101 })).toBeNull();
    expect(fillerNeed({ ...base, quietS: 100, toNextS: 100 })).toBe('gap');
    expect(fillerNeed({ ...base, quietS: 110, toNextS: 600 })).toBe('gap');
  });
  it('never fills right before a placed line, nor while the runner is stopped', () => {
    expect(fillerNeed({ ...base, quietS: 140, toNextS: 30 })).toBeNull();
    expect(fillerNeed({ ...base, moving: false, quietS: 140, toNextS: 300 })).toBeNull();
  });
});
