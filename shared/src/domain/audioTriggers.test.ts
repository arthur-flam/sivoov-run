import { describe, expect, it } from 'vitest';
import { AudioEventSchema } from '../schemas/audio';
import { afterPause, nextEvents } from './audioTriggers';

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
