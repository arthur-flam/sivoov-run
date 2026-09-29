import { describe, expect, it } from 'vitest';
import { deauvilleMarathonGeometry } from '../fixtures';
import { firstRealRunSamples, firstRealRunWatchM } from '../fixtures/firstRealRun';
import { buildTrack } from './course';
import { constantPace, simulateRun } from './simulate';
import { fixTime } from './fixClock';
import { abandon, applySample, bridgedGap, idleRun, progress, startRun, tick } from './tracker';
import type { RunState } from './tracker';

const track = buildTrack(deauvilleMarathonGeometry.points);

const runThrough = (targetM: number, noiseM: number, paceSecPerKm = 300, speedScale = 1): RunState => {
  const samples = simulateRun({ track, targetM: targetM * 1.05, pace: constantPace(paceSecPerKm), startTime: 1000, noiseM, seed: 3, speedScale });
  return samples.reduce((s, sample) => applySample(s, sample), startRun(idleRun(targetM), 1000));
};

describe('run tracker', () => {
  it('ignores fixes before the gun', () => {
    const s = applySample(idleRun(10000), { lat: 49, lng: 0, timestamp: 0 });
    expect(s.phase).toBe('idle');
    expect(s.accepted).toBe(0);
  });

  it('finishes a clean 10 km at 5:00/km within 10 s of 50:00, with 10 splits', () => {
    const s = runThrough(10000, 0);
    expect(s.phase).toBe('finished');
    expect(s.distanceM).toBe(10000);
    // The smoothed distance trails the raw sum by a few meters: a few seconds at the finish.
    expect(Math.abs(s.elapsedMs - 50 * 60 * 1000)).toBeLessThan(10_000);
    expect(s.splits.map((x) => x.km)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    s.splits.forEach((split) => expect(Math.abs(split.splitMs - 300_000)).toBeLessThan(3000));
    expect(Math.abs(s.avgPaceSecPerKm! - 300)).toBeLessThan(1);
  });

  it('stays honest with 8 m GPS noise: within 1.5 % on distance, splits within 5 %', () => {
    const s = runThrough(5000, 8);
    expect(s.phase).toBe('finished');
    const err = Math.abs(s.elapsedMs - 25 * 60 * 1000) / (25 * 60 * 1000);
    expect(err).toBeLessThan(0.015);
    s.splits.forEach((split) => expect(Math.abs(split.splitMs - 300_000) / 300_000).toBeLessThan(0.05));
    expect(s.rejected).toBeGreaterThan(0);
  });

  it('measures the first real run within 0.5 % of the watch worn on it', () => {
    // Galaxy S23, 46 min, 2 774 fixes. The old +-15 % speed clamp read 9 032 m: 1.9 % short.
    const s = firstRealRunSamples(1000).reduce((acc, sample) => applySample(acc, sample), startRun(idleRun(42195), 1000));
    expect(Math.abs(s.distanceM / firstRealRunWatchM - 1)).toBeLessThan(0.005);
    expect(s.splits.map((x) => x.km)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('is not held back by a phone that reports its speed 15 % low', () => {
    const s = runThrough(5000, 3, 300, 0.85);
    expect(s.phase).toBe('finished');
    expect(Math.abs(s.elapsedMs - 25 * 60 * 1000) / (25 * 60 * 1000)).toBeLessThan(0.01);
  });

  it('keeps distance monotonic and reports a live pace', () => {
    const samples = simulateRun({ track, targetM: 1500, pace: constantPace(330), startTime: 0, noiseM: 6, seed: 9 });
    const states = samples.reduce<RunState[]>((acc, sample) => [...acc, applySample(acc[acc.length - 1]!, sample)], [startRun(idleRun(5000), 0)]);
    states.slice(1).forEach((s, i) => expect(s.distanceM).toBeGreaterThanOrEqual(states[i]!.distanceM));
    const last = states[states.length - 1]!;
    expect(last.phase).toBe('running');
    expect(last.paceSecPerKm).not.toBeNull();
    expect(Math.abs(last.paceSecPerKm! - 330)).toBeLessThan(40);
    expect(progress(last)).toBeCloseTo(0.3, 1);
  });

  it('ticks the clock between fixes and freezes it at the finish', () => {
    const running = tick(startRun(idleRun(1000), 0), 5000);
    expect(running.elapsedMs).toBe(5000);
    const done = runThrough(1000, 0);
    expect(tick(done, 1e9).elapsedMs).toBe(done.elapsedMs);
  });

  it('abandon ends the run without making it a finish', () => {
    expect(abandon(startRun(idleRun(1000), 0)).phase).toBe('abandoned');
    expect(abandon(idleRun(1000)).phase).toBe('idle');
  });

  it('does not count distance from a fix taken before the gun', () => {
    // A cached fix at home, five minutes before the start, then the real start 400 m away.
    const gun = 300_000;
    const home = { lat: 49.3600, lng: 0.0700, accuracy: 15, timestamp: 0 };
    const start = { lat: 49.3636, lng: 0.0700, accuracy: 3, timestamp: gun + 1000 };
    const onward = { lat: 49.3637, lng: 0.0700, accuracy: 3, timestamp: gun + 4000 };
    const s = [home, start, onward].reduce((acc, sample) => applySample(acc, sample), startRun(idleRun(10000), gun));
    expect(s.rejected).toBe(1);
    expect(s.distanceM).toBeLessThan(20);
  });

  it('crosses a tunnel: two minutes of vague fixes, then the straight line once the sky is back', () => {
    const samples = simulateRun({ track, targetM: 5000, pace: constantPace(300), startTime: 1000, noiseM: 3, seed: 5 });
    const inside = (t: number) => t > 1000 + 8 * 60_000 && t < 1000 + 10 * 60_000;
    // In the tunnel the phone still answers, with a position it is not sure of (and sometimes a wild one).
    const tunnel = samples.map((s, i) => (inside(s.timestamp) ? { ...s, accuracy: 60, lat: s.lat + (i % 7 === 0 ? 0.01 : 0) } : s));
    const clear = samples.reduce((acc, sample) => applySample(acc, sample), startRun(idleRun(5000), 1000));
    const dark = tunnel.reduce((acc, sample) => applySample(acc, sample), startRun(idleRun(5000), 1000));
    expect(dark.phase).toBe('running');
    expect(Math.abs(dark.distanceM - clear.distanceM) / clear.distanceM).toBeLessThan(0.02);
    // Nothing from inside counted, and the clock never stopped.
    expect(dark.rejected).toBeGreaterThanOrEqual(115);
    expect(dark.elapsedMs).toBe(clear.elapsedMs);
  });

  it('keeps measuring with a receiver whose clock is years off, once its fixes are dated on arrival', () => {
    const samples = simulateRun({ track, targetM: 2000, pace: constantPace(300), startTime: 1000, noiseM: 3, seed: 2 });
    const rolledBack = samples.map((s) => ({ ...s, timestamp: s.timestamp - 1024 * 7 * 24 * 3600_000 }));
    const gun = 1024 * 7 * 24 * 3600_000 + 1000;
    const arrived = rolledBack.map((s, i) => ({ ...s, timestamp: fixTime(s.timestamp, gun + i * 1000) }));
    const raw = rolledBack.reduce((acc, sample) => applySample(acc, sample), startRun(idleRun(2000), gun));
    const fixed = arrived.reduce((acc, sample) => applySample(acc, sample), startRun(idleRun(2000), gun));
    expect(raw.distanceM).toBe(0);
    expect(fixed.distanceM).toBeGreaterThan(1500);
  });

  it('tells a step that bridged a long silence from an ordinary one', () => {
    const samples = simulateRun({ track, targetM: 2000, pace: constantPace(300), startTime: 1000, noiseM: 0, seed: 1 });
    const upTo = (list: typeof samples) => list.reduce((acc, sample) => applySample(acc, sample), startRun(idleRun(2000), 1000));
    const before = upTo(samples.slice(0, 100));
    expect(bridgedGap(before, applySample(before, samples[100]!))).toBe(false);
    // Ninety seconds without a fix, then one far along.
    expect(bridgedGap(before, applySample(before, samples[190]!))).toBe(true);
    // A rejected fix bridges nothing.
    expect(bridgedGap(before, applySample(before, { ...samples[190]!, accuracy: 80 }))).toBe(false);
  });
});
