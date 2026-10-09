import { describe, expect, it } from 'vitest';
import { AudioEventSchema } from '../schemas/audio';
import { NO_PAUSE, followPause, holds, isSlow, pickTake, readRun } from './runReading';
import type { RunReading } from './runReading';
import { idleRun } from './tracker';
import type { RunState } from './tracker';

/** A 10 km run at `elapsedS`, `distanceM` done, with one split per pace given (seconds per km). */
const run = (kmPaces: number[], extra: Partial<RunState> = {}): RunState => {
  const splits = kmPaces.reduce<RunState['splits']>((acc, s, i) => [...acc, { km: i + 1, splitMs: s * 1000, elapsedMs: (acc[i - 1]?.elapsedMs ?? 0) + s * 1000 }], []);
  const last = splits[splits.length - 1];
  return { ...idleRun(10_000), phase: 'running', startedAt: 0, splits, distanceM: splits.length * 1000, elapsedMs: last?.elapsedMs ?? 0, ...extra };
};

const reading = (over: Partial<RunReading> = {}): RunReading => ({ refPaceS: 300, drift: null, projectedS: null, targetS: null, best: null, restart: false, ...over });

describe('readRun', () => {
  it('measures the runner’s own rhythm over km 1-2 and reads the last km against it', () => {
    expect(readRun(run([300])).refPaceS).toBeNull();
    expect(readRun(run([310, 290])).refPaceS).toBe(300);
    expect(readRun(run([310, 290])).drift).toBeNull();
    expect(readRun(run([310, 290, 303])).drift).toBe('steady');
    expect(readRun(run([310, 290, 285])).drift).toBe('faster');
    expect(readRun(run([310, 290, 320])).drift).toBe('slower');
  });

  it('finds a round finish time close to the projection, once the run is under way', () => {
    // 4 km in 20:10: 50:25 projected, close to 50 minutes.
    expect(readRun(run([300, 305, 300, 305])).targetS).toBe(3000);
    // 4 km in 21:20: 53:20 projected, nowhere near a round time.
    expect(readRun(run([320, 320, 320, 320])).targetS).toBeNull();
    // Too early to say: 2 km.
    expect(readRun(run([300, 305])).targetS).toBeNull();
  });

  it('keeps the fastest kilometre', () => {
    expect(readRun(run([310, 290, 295])).best).toEqual({ km: 2, seconds: 290 });
  });
});

describe('the runner’s stops', () => {
  const at = (distanceM: number, elapsedS: number, window: [number, number][]): RunState =>
    ({ ...idleRun(10_000), phase: 'running', startedAt: 0, distanceM, elapsedMs: elapsedS * 1000, window: window.map(([s, m]) => ({ elapsedMs: s * 1000, distanceM: m })) }) as RunState;

  it('sees a runner standing still once no ground was counted for a while, and one walking from their speed', () => {
    expect(isSlow(at(2000, 600, [[590, 1970], [600, 2000]]))).toBe(false);
    expect(isSlow(at(2000, 615, [[590, 1970], [600, 2000]]))).toBe(true);
    expect(isSlow(at(2000, 600, [[590, 1985], [600, 2000]]))).toBe(true);
    expect(isSlow(at(50, 60, []))).toBe(false);
  });

  it('remembers a stop once the runner runs again, and says restart for a while after a long enough one', () => {
    const running = at(2000, 600, [[590, 1970], [600, 2000]]);
    const standing = at(2000, 640, [[590, 1970], [600, 2000]]);
    const again = at(2030, 650, [[600, 2000], [640, 2002], [650, 2030]]);
    const paused = [running, standing, again].reduce(followPause, NO_PAUSE);
    expect(paused.last).toEqual({ endedMs: 650_000, lastedMs: 50_000 });
    expect(readRun(again, paused).restart).toBe(true);
    expect(readRun({ ...again, elapsedMs: 700_000 }, paused).restart).toBe(false);
  });
});

describe('pickTake', () => {
  const split = AudioEventSchema.parse({
    id: 'split',
    category: 'personal',
    trigger: { kind: 'split', everyMeters: 1000 },
    source: { kind: 'file', key: 'split.wav' },
    takes: [
      { id: 'steady', key: 'split~steady.wav', when: 'steady' },
      { id: 'b', key: 'split~b.wav' },
      { id: 'restart', key: 'split~restart.wav', when: 'restart' },
    ],
  });

  it('says a take written for this moment of the run first, then the ones not heard yet, in order', () => {
    expect(pickTake(split, reading({ drift: 'steady' }), [])).toBe('steady');
    expect(pickTake(split, reading({ drift: 'faster' }), [])).toBeUndefined();
    expect(pickTake(split, reading({ drift: 'faster' }), [undefined])).toBe('b');
  });

  it('never repeats while something unheard fits, then goes round the least heard', () => {
    expect(pickTake(split, reading({ drift: 'steady' }), ['steady'])).toBeUndefined();
    expect(pickTake(split, reading({ drift: 'steady' }), ['steady', undefined, 'b'])).toBe('steady');
    expect(pickTake(split, reading(), [undefined, 'b', undefined])).toBe('b');
  });

  it('keeps a take for a moment out of every other moment, and gives only that one when asked', () => {
    expect(pickTake(split, reading(), [undefined, 'b'])).not.toBe('restart');
    expect(pickTake(split, reading({ restart: true }), [], 'restart')).toBe('restart');
  });

  it('reads the conditions from the run', () => {
    expect(holds('round', reading({ targetS: 3000 }))).toBe(true);
    expect(holds('round', reading())).toBe(false);
    expect(holds('slower', reading({ drift: 'slower' }))).toBe(true);
  });
});
