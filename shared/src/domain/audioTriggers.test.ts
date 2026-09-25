import { describe, expect, it } from 'vitest';
import { AudioEventSchema } from '../schemas/audio';
import { afterPause, ceremonySequence, nextEvents } from './audioTriggers';

const ev = (id: string, trigger: unknown, extra: Record<string, unknown> = {}) =>
  AudioEventSchema.parse({ id, trigger, source: { kind: 'file', key: `${id}.mp3` }, category: 'course', ...extra });

const pack = {
  events: [
    ev('gun', { kind: 'start' }, { category: 'ceremony', priority: 10 }),
    ev('planches', { kind: 'distance', meters: 200 }),
    ev('km', { kind: 'split', everyMeters: 1000 }, { category: 'personal', once: false }),
    ev('slow', { kind: 'pace', slowerThan: 360, afterMeters: 1000 }, { category: 'coaching', once: false }),
    ev('tenmin', { kind: 'elapsed', seconds: 600 }),
    ev('finish', { kind: 'finish' }, { category: 'ceremony', priority: 10 }),
  ],
};
const none = new Set<string>();

describe('nextEvents', () => {
  it('fires nothing before the gun', () => {
    expect(nextEvents({ phase: 'idle', distanceM: 0, elapsedMs: 0, paceSecPerKm: null }, pack, none)).toEqual([]);
  });
  it('fires the start once, highest priority first', () => {
    const s = { phase: 'running' as const, distanceM: 250, elapsedMs: 60_000, paceSecPerKm: null };
    const keys = nextEvents(s, pack, none).map((f) => f.key);
    expect(keys).toEqual(['gun', 'planches']);
    expect(nextEvents(s, pack, new Set(keys))).toEqual([]);
  });
  it('fires a split per kilometer, never twice', () => {
    const at = (m: number) => ({ phase: 'running' as const, distanceM: m, elapsedMs: m * 250, paceSecPerKm: 300 });
    const fired = new Set(['gun', 'planches']);
    expect(nextEvents(at(999), pack, fired).map((f) => f.key)).toEqual([]);
    expect(nextEvents(at(1000), pack, fired).map((f) => f.key)).toEqual(['km#1']);
    fired.add('km#1');
    expect(nextEvents(at(1500), pack, fired).map((f) => f.key)).toEqual([]);
    expect(nextEvents(at(2010), pack, fired).map((f) => f.key)).toEqual(['km#2']);
  });
  it('coaches when the pace drops, at most once per km', () => {
    const fired = new Set(['gun', 'planches', 'km#1', 'km#2']);
    const slow = { phase: 'running' as const, distanceM: 2500, elapsedMs: 900_000, paceSecPerKm: 400 };
    expect(nextEvents(slow, pack, fired).map((f) => f.key)).toEqual(['slow#2', 'tenmin']);
    fired.add('slow#2').add('tenmin');
    expect(nextEvents({ ...slow, distanceM: 2800 }, pack, fired)).toEqual([]);
    expect(nextEvents({ ...slow, distanceM: 2800, paceSecPerKm: 330 }, pack, fired)).toEqual([]);
  });
  it('does not coach before afterMeters', () => {
    expect(nextEvents({ phase: 'running', distanceM: 500, elapsedMs: 0, paceSecPerKm: 500 }, pack, new Set(['gun', 'planches'])).map((f) => f.key)).toEqual([]);
  });
  it('fires the finish and only the finish survives a pause', () => {
    const s = { phase: 'finished' as const, distanceM: 10000, elapsedMs: 3_000_000, paceSecPerKm: 300 };
    const firings = nextEvents(s, pack, new Set(['gun']));
    expect(firings.map((f) => f.key)).toContain('finish');
    expect(afterPause(firings).map((f) => f.key)).toEqual(['finish']);
  });
});

describe('the start ceremony', () => {
  const intro = ev('intro', { kind: 'cue', at: 'armed', order: 1 }, { category: 'ceremony' });
  const marks = ev('marks', { kind: 'cue', at: 'armed', order: 2 }, { category: 'ceremony' });
  const countdown = ev('countdown', { kind: 'cue', at: 'countdown', order: 1 }, { category: 'ceremony' });
  const gun = ev('gun', { kind: 'cue', at: 'gun', order: 1 }, { category: 'ceremony' });
  const roar = ev('roar', { kind: 'cue', at: 'gun', order: 2 }, { category: 'ceremony' });
  const planches = ev('planches', { kind: 'distance', meters: 200 });
  const ids = (events: { id: string }[] | undefined) => events?.map((e) => e.id);

  it('plays the intro, then the countdown, then the gun, whatever order the pack lists them in', () => {
    const ceremony = ceremonySequence({ events: [planches, gun, countdown, marks, intro] });
    expect(ids(ceremony?.lines)).toEqual(['intro', 'marks', 'countdown', 'gun']);
    // The clock starts when the gun line starts playing, not when the countdown ends.
    expect(ceremony?.gunIndex).toBe(3);
  });

  it('keeps pack order between lines of the same moment and order', () => {
    const a = ev('a', { kind: 'cue', at: 'armed', order: 1 });
    const b = ev('b', { kind: 'cue', at: 'armed', order: 1 });
    expect(ids(ceremonySequence({ events: [b, a] })?.lines)).toEqual(['b', 'a']);
  });

  it('lets a second gun line (the roar) follow the gun: the first one starts the clock', () => {
    const ceremony = ceremonySequence({ events: [roar, gun, countdown] });
    expect(ids(ceremony?.lines)).toEqual(['countdown', 'gun', 'roar']);
    expect(ceremony?.gunIndex).toBe(1);
  });

  it('starts the clock after the last line when the ceremony has no gun', () => {
    const ceremony = ceremonySequence({ events: [countdown, intro] });
    expect(ids(ceremony?.lines)).toEqual(['intro', 'countdown']);
    expect(ceremony?.gunIndex).toBe(2);
  });

  it('is absent for a pack with no cue, whose ceremony still fires at the gun as before', () => {
    const older = { events: [ev('welcome', { kind: 'start' }, { category: 'ceremony', priority: 10 }), ev('go', { kind: 'elapsed', seconds: 0 }, { category: 'ceremony', priority: 10 }), planches] };
    expect(ceremonySequence(older)).toBeNull();
    const atGun = { phase: 'running' as const, distanceM: 0, elapsedMs: 0, paceSecPerKm: null };
    expect(nextEvents(atGun, older, none).map((f) => f.key)).toEqual(['welcome', 'go']);
  });

  it('never fires a cue from the run, before, during or after it', () => {
    const pack = { events: [intro, countdown, gun, roar] };
    const states = [
      { phase: 'idle' as const, distanceM: 0, elapsedMs: 0, paceSecPerKm: null },
      { phase: 'running' as const, distanceM: 0, elapsedMs: 0, paceSecPerKm: null },
      { phase: 'running' as const, distanceM: 21_000, elapsedMs: 7_200_000, paceSecPerKm: 330 },
      { phase: 'finished' as const, distanceM: 42_195, elapsedMs: 14_000_000, paceSecPerKm: 330 },
    ];
    expect(states.flatMap((s) => nextEvents(s, pack, none))).toEqual([]);
  });
});
