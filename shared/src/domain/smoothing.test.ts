import { describe, expect, it } from 'vitest';
import { judgeSample, kalmanInit, kalmanStep } from './smoothing';

describe('kalman on distance', () => {
  it('converges on a steady runner and estimates the speed', () => {
    const speed = 3; // m/s
    const truth = (i: number) => i * speed;
    const noise = [2, -3, 1, -1, 4, -2, 0, 3, -4, 1, 2, -1, 0, 1, -2, 3, -1, 0, 2, -3];
    const final = noise.reduce(
      (s, n, i) => (i === 0 ? s : kalmanStep(s, truth(i) + n, i * 1000, 5)),
      kalmanInit(0, 0, 5),
    );
    expect(final.d).toBeCloseTo(truth(noise.length - 1), -1);
    expect(final.v).toBeCloseTo(speed, 0);
  });
  it('trusts precise fixes more than vague ones', () => {
    const s = kalmanInit(0, 0, 5);
    const precise = kalmanStep(s, 100, 1000, 2);
    const vague = kalmanStep(s, 100, 1000, 50);
    expect(precise.d).toBeGreaterThan(vague.d);
  });
});

describe('sample filter', () => {
  const at = (lat: number, lng: number, timestamp: number, accuracy = 5) => ({ lat, lng, timestamp, accuracy });
  it('accepts the first fix with no distance', () => {
    expect(judgeSample(undefined, at(49, 0, 0))).toEqual({ ok: true, stepM: 0 });
  });
  it('rejects bad accuracy, time going backwards, teleports and jitter', () => {
    const prev = at(49, 0, 1000);
    expect(judgeSample(prev, at(49, 0.0001, 2000, 80))).toMatchObject({ ok: false, reason: 'accuracy' });
    expect(judgeSample(prev, at(49, 0.0001, 500))).toMatchObject({ ok: false, reason: 'time' });
    expect(judgeSample(prev, at(49.01, 0, 2000))).toMatchObject({ ok: false, reason: 'speed' });
    expect(judgeSample(prev, at(49.00003, 0, 2000))).toMatchObject({ ok: false, reason: 'jitter' });
  });
  it('accepts a normal stride', () => {
    const v = judgeSample(at(49, 0, 1000), at(49.0001, 0, 4000));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.stepM).toBeCloseTo(11.1, 0);
  });
  it('bounds a step by the Doppler speed when both fixes report one', () => {
    const v = judgeSample({ ...at(49, 0, 1000), speed: 3 }, { ...at(49.0002, 0, 4000), speed: 3 });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.stepM).toBeCloseTo(9 * 1.15, 1);
  });
});
