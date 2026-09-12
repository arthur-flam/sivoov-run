import { describe, expect, it } from 'vitest';
import { deauvilleMarathonGeometry } from '../fixtures';
import { buildTrack } from './course';
import { constantPace, simulateRun } from './simulate';
import { abandon, applySample, idleRun, progress, startRun, tick } from './tracker';
import type { RunState } from './tracker';

const track = buildTrack(deauvilleMarathonGeometry.points);

const runThrough = (targetM: number, noiseM: number, paceSecPerKm = 300): RunState => {
  const samples = simulateRun({ track, targetM: targetM * 1.05, pace: constantPace(paceSecPerKm), startTime: 1000, noiseM, seed: 3 });
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

  it('abandon ends the run', () => {
    expect(abandon(startRun(idleRun(1000), 0)).phase).toBe('finished');
  });
});
