import { describe, expect, it } from 'vitest';
import { AudioPackSchema } from '../schemas/audio';
import type { AudioPack } from '../schemas/audio';
import { CLEAR_AHEAD_S, MAX_GAP_S, dueLines, gapToFill } from './rhythm';
import { NO_PAUSE } from './runReading';
import { hearRun } from './simulate';
import type { Heard, RunPlan } from './simulate';
import { idleRun } from './tracker';

const file = (seconds: number) => ({ url: 'x', bytes: 1, sha256: 'x', seconds });
const letters = 'abcdefghijkl'.split('');
const PLACES = [250, 650, 2100, 3300, 5950, 6900, 9000];
/** The gun's ambiance: the race sounds for this long after the start. */
const GUN_S = 70;

/** A 10 km course with the Champs-Élysées' places, a split every km, two pools of fillers. */
const pack = (over: Partial<AudioPack> = {}): AudioPack =>
  AudioPackSchema.parse({
    courseId: 'c',
    version: 1,
    events: [
      { id: 'gun', category: 'ceremony', trigger: { kind: 'cue', at: 'gun', order: 1 }, source: { kind: 'file', key: 'gun.mp3' }, under: 'gun-under.mp3' },
      ...PLACES.map((m) => ({ id: `at${m}`, category: 'course', priority: 6, trigger: { kind: 'distance', meters: m }, source: { kind: 'file', key: `at${m}.mp3` } })),
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
      'gun-under.mp3': file(GUN_S),
      ...Object.fromEntries(PLACES.map((m) => [`at${m}.mp3`, file(9)])),
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

/** The longest quiet stretch while the runner runs: from the end of one sound to the start of the next, outside `[from, to]` seconds. */
const longestSilence = (p: AudioPack, heard: Heard[], skip: [number, number][] = []): number => {
  const seconds = (key?: string) => (key ? (p.files[key]?.seconds ?? 0) : 0);
  let end = GUN_S;
  return heard
    .filter((h) => !h.missed)
    .reduce((worst, h) => {
      const start = h.elapsedMs / 1000;
      const quiet = skip.some(([a, b]) => end < b && start > a) ? 0 : start - end;
      end = Math.max(end, start + Math.max(h.seconds, seconds(h.under)));
      return Math.max(worst, quiet);
    }, 0);
};

const isFiller = (h: Heard) => h.eventId === 'crowd' || h.eventId === 'speaker';
const at = (h: Heard) => h.elapsedMs / 1000;

describe('the rhythm director', () => {
  it.each([240, 300, 360, 420, 480])('never leaves the race quiet longer than the course allows, at %i s/km', (pace) => {
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: pace });
    expect(longestSilence(pack(), heard)).toBeLessThanOrEqual(MAX_GAP_S + 2);
    expect(heard.some(isFiller)).toBe(true);
    expect(heard[heard.length - 1]!.eventId).toBe('finish');
  });

  it('holds with a poor fix at 7:30/km, where the tracker counts ground in long steps', () => {
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: 450, accuracyM: 15 });
    expect(longestSilence(pack(), heard)).toBeLessThanOrEqual(MAX_GAP_S + 2);
    expect(heard.filter((h) => h.take === 'again')).toEqual([]);
  });

  it('keeps clear of the next placed line', () => {
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: 330 });
    heard.forEach((h, i) => {
      const next = heard.slice(i + 1).find((n) => !isFiller(n));
      if (isFiller(h) && next) expect(at(next) - at(h)).toBeGreaterThan(CLEAR_AHEAD_S - 2);
    });
  });

  it('follows the course’s own limit', () => {
    const p = pack({ maxGapS: 90 });
    expect(longestSilence(p, hearRun(p, 10_000, { paceSecPerKm: 360 }))).toBeLessThanOrEqual(92);
  });

  it('goes round each pool before saying anything twice, and alternates the pools', () => {
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: 480 }).filter(isFiller);
    const crowd = heard.filter((h) => h.eventId === 'crowd').map((h) => h.take ?? '');
    expect(new Set(crowd.slice(0, 13)).size).toBe(Math.min(13, crowd.length));
    expect(heard.slice(0, 4).map((h) => h.eventId)).toEqual(['crowd', 'speaker', 'crowd', 'speaker']);
  });
});

describe('a runner who stops', () => {
  /** When the plan's only stop starts and ends, in seconds from the gun: the runner reaches its spot at their pace. */
  const stopOf = (plan: RunPlan): [number, number] => {
    const stop = plan.stops![0]!;
    const from = (stop.atM * plan.paceSecPerKm) / 1000;
    return [from, from + stop.seconds];
  };

  it.each<[string, RunPlan]>([
    ['a short stop', { paceSecPerKm: 330, stops: [{ atM: 4200, seconds: 40 }] }],
    ['a stop longer than a GPS gap', { paceSecPerKm: 330, stops: [{ atM: 4200, seconds: 90 }] }],
    ['a stop with the phone in a pocket', { paceSecPerKm: 330, stops: [{ atM: 4200, seconds: 90 }], screen: 'off' }],
  ])('gets one word once running again, after %s, and none while standing', (_, plan) => {
    const heard = hearRun(pack(), 10_000, plan);
    const [from, to] = stopOf(plan);
    const restarts = heard.filter((h) => h.take === 'again' && !h.missed);
    expect(restarts).toHaveLength(1);
    expect(at(restarts[0]!)).toBeGreaterThan(to);
    expect(at(restarts[0]!)).toBeLessThan(to + 25);
    expect(heard.filter((h) => isFiller(h) && at(h) > from + 2 && at(h) < to)).toEqual([]);
  });

  it('gets a word after each stop, and after a walk', () => {
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: 330, stops: [{ atM: 2500, seconds: 45 }, { atM: 7500, seconds: 45 }], walks: [{ atM: 4500, seconds: 60 }] });
    expect(heard.filter((h) => h.take === 'again' && !h.missed)).toHaveLength(3);
  });

  it('does not crowd the next placed line with it', () => {
    // The stop ends a few metres before the km-4 split.
    const heard = hearRun(pack(), 10_000, { paceSecPerKm: 330, stops: [{ atM: 3985, seconds: 40 }] });
    const restart = heard.find((h) => h.take === 'again');
    const split = heard.find((h) => h.key === 'split#4')!;
    if (restart) expect(Math.abs(at(split) - at(restart))).toBeGreaterThan(10);
  });
});

describe('dueLines', () => {
  const running = { ...idleRun(10_000), phase: 'running' as const, startedAt: 0, distanceM: 3000, elapsedMs: 900_000, paceSecPerKm: 300, window: [{ elapsedMs: 895_000, distanceM: 2983 }, { elapsedMs: 900_000, distanceM: 3000 }] };

  it('does not count a line missed in a GPS gap as heard: its pool turn and its sound are not used up', () => {
    const before = ['at250', 'at650', 'at2100'].map((id) => ({ eventId: id, key: id, elapsedMs: 600_000 }));
    const splits = [1, 2, 3].map((n) => ({ eventId: 'split', key: `split#${n}`, elapsedMs: 700_000 }));
    const missed = [...before, ...splits, { eventId: 'crowd', key: 'crowd#1', elapsedMs: 880_000, missed: true }];
    const due = dueLines(running, pack(), missed, NO_PAUSE);
    expect(due.map((d) => [d.event.id, d.take ?? null])).toEqual([['crowd', null]]);
  });
});

describe('gapToFill', () => {
  it('waits while the next placed line will come in time', () => {
    expect(gapToFill(100, 45, 150)).toBe(false);
  });
  it('cuts a long silence in two, never later than 40 s before the maximum', () => {
    expect(gapToFill(99, 101, 150)).toBe(false);
    expect(gapToFill(100, 100, 150)).toBe(true);
    expect(gapToFill(110, 600, 150)).toBe(true);
  });
  it('never fills right before a placed line', () => {
    expect(gapToFill(140, 30, 150)).toBe(false);
  });
});

describe('a big moment', () => {
  it('keeps the kilometre call right after it quiet, and only that one', () => {
    // The climb's line at 5 950 m, priority 7: the km-6 call 50 m later gives way; km 5 and km 7 are said.
    const p = pack();
    const climb = { ...p, events: p.events.map((e) => (e.id === 'at5950' ? { ...e, priority: 7 } : e)) };
    const heard = hearRun(climb, 10_000, { paceSecPerKm: 330 });
    const split = (n: number) => heard.find((h) => h.key === `split#${n}`)!;
    expect(split(6).missed).toBe(true);
    expect(split(5).missed).toBeUndefined();
    expect(split(7).missed).toBeUndefined();
  });
});
