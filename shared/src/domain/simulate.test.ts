import { describe, expect, it } from 'vitest';
import { deauvilleMarathonGeometry } from '../fixtures';
import { buildTrack, positionAtDistance } from './course';
import { haversineM } from './geo';
import { constantPace, fadingPace, seededRandom, simulateRun } from './simulate';

const track = buildTrack(deauvilleMarathonGeometry.points);

describe('simulate', () => {
  it('is deterministic for a seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('runs 10 km at 5:00/km in 50 minutes along the first 10 km of the course', () => {
    const samples = simulateRun({ track, targetM: 10000, pace: constantPace(300), startTime: 0 });
    const last = samples[samples.length - 1]!;
    expect(last.timestamp).toBe(50 * 60 * 1000);
    expect(haversineM(last, positionAtDistance(track, 10000).point)).toBeLessThan(1);
    expect(samples[0]).toMatchObject({ lat: track.points[0]!.lat, lng: track.points[0]!.lng, timestamp: 0 });
  });
  it('a full marathon ends on the finish line and refuses to run past the course', () => {
    const samples = simulateRun({ track, targetM: track.totalM, pace: constantPace(240), startTime: 0, intervalMs: 5000 });
    expect(haversineM(samples[samples.length - 1]!, track.points[track.points.length - 1]!)).toBeLessThan(1);
    expect(() => simulateRun({ track, targetM: track.totalM + 100, pace: constantPace(240), startTime: 0 })).toThrow();
  });
  it('slows down with a fading profile', () => {
    const samples = simulateRun({ track, targetM: 10000, pace: fadingPace(300, 360, 10000), startTime: 0 });
    expect(samples[samples.length - 1]!.timestamp).toBeGreaterThan(50 * 60 * 1000);
    expect(samples[samples.length - 1]!.timestamp).toBeLessThan(60 * 60 * 1000);
  });
  it('adds bounded noise', () => {
    const clean = simulateRun({ track, targetM: 2000, pace: constantPace(300), startTime: 0 });
    const noisy = simulateRun({ track, targetM: 2000, pace: constantPace(300), startTime: 0, noiseM: 5, seed: 7 });
    const offsets = clean.map((c, i) => haversineM(c, noisy[i]!));
    expect(Math.max(...offsets)).toBeLessThan(25);
    expect(offsets.reduce((a, b) => a + b, 0) / offsets.length).toBeGreaterThan(1);
  });
});
