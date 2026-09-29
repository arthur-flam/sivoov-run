import { describe, expect, it } from 'vitest';
import { applySample, buildTrack, constantPace, deauvilleMarathonGeometry, glideStep, idleRun, simulateSamples, speedFromPace, startRun } from '@sivoov/shared';
import { GLIDE_MS, nextCameraPlan } from './mapConfig';
import type { CameraPlan } from './mapConfig';

/**
 * The whole chain the screen runs, in one dimension: the simulation's fixes on its own clock,
 * the tracker's distance, the glide, the camera's plan, and the map carrying out each move
 * evenly from wherever the camera is. What the runner sees is the camera's speed, frame by frame.
 */
const cameraSpeeds = ({ rate, seconds }: { rate: number; seconds: number }) => {
  const track = buildTrack(deauvilleMarathonGeometry.points);
  const targetM = 10_000;
  const pace = 300;
  const samples = simulateSamples({ track, targetM, pace: constantPace(pace), startTime: 0, noiseM: 4, seed: 3 });
  // The course as a line: the camera's position is its distance along it.
  const at = (m: number) => ({ center: { lat: m, lng: 0 }, bearing: 0 });
  const bounds = { ne: [1, 1] as [number, number], sw: [0, 0] as [number, number] };

  let state = startRun(idleRun(targetM), 0);
  let next = samples.next();
  let shown = 0;
  let stepped = { m: 0, at: 0 };
  let plan: CameraPlan | null = null;
  let move = { from: 0, to: 0, start: 0, ms: 1 };
  const camera = (t: number) => move.from + (move.to - move.from) * Math.min(1, (t - move.start) / move.ms);
  const speeds: number[] = [];
  let before = 0;
  const frame = 16;
  for (let t = 0; t <= seconds * 1000; t += frame) {
    if (t % GLIDE_MS < frame) {
      while (!next.done && next.value.timestamp <= t * rate) {
        state = applySample(state, next.value);
        next = samples.next();
      }
      if (state.distanceM !== stepped.m) stepped = { m: state.distanceM, at: t };
      const speed = speedFromPace(state.paceSecPerKm) * rate;
      shown = glideStep({ fixM: state.distanceM, sinceFixMs: t - stepped.at, speedMps: speed, shownM: shown, dtMs: GLIDE_MS, targetM });
      const planned = nextCameraPlan(plan, 'follow', (ms) => at(shown + (speed * ms) / 1000), bounds, t);
      if (planned !== plan && plan !== null) move = { from: camera(t), to: planned.shot.kind === 'follow' ? planned.shot.center[1] : 0, start: t, ms: planned.shot.durationMs };
      plan = planned;
    }
    const now = camera(t);
    if (t > 15_000) speeds.push((now - before) / (frame / 1000));
    before = now;
  }
  const sorted = [...speeds].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)]!, p5: sorted[Math.floor(sorted.length * 0.05)]!, p95: sorted[Math.floor(sorted.length * 0.95)]!, stalls: speeds.filter((s) => s < 0.1).length };
};

describe('the followed camera, as the runner sees it', () => {
  it('moves at an even speed through a simulation five times faster than life, never stopping', () => {
    const { median, p5, p95, stalls } = cameraSpeeds({ rate: 5, seconds: 60 });
    expect(median).toBeGreaterThan(16.7 * 0.85);
    expect(median).toBeLessThan(16.7 * 1.15);
    expect(p5).toBeGreaterThan(median * 0.8);
    expect(p95).toBeLessThan(median * 1.2);
    expect(stalls).toBe(0);
  });

  it('and on a real run, whose pace wanders more with the GPS', () => {
    const { median, p5, p95, stalls } = cameraSpeeds({ rate: 1, seconds: 90 });
    expect(median).toBeGreaterThan(3.33 * 0.85);
    expect(p5).toBeGreaterThan(median * 0.7);
    expect(p95).toBeLessThan(median * 1.3);
    expect(stalls).toBe(0);
  });
});
