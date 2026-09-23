import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrack, constantPace, deauvilleMarathonGeometry } from '@sivoov/shared';
import { CourseSchema, deauvilleMarathonLandmarks } from '@sivoov/shared';
import { packV0 } from '@/audio/pack';
import { simulationSource } from '@/services/location/simulation';
import type { LocationSource } from '@/services/location';
import { useRun } from './run';

/** A device-like source whose start can be made to fail, counting what the store asked of it. */
const fakeSource = (startImpl: () => Promise<void> = async () => undefined) => {
  const calls = { start: 0, stop: 0 };
  const source: LocationSource = {
    kind: 'device',
    now: () => Date.now(),
    start: async () => {
      calls.start += 1;
      await startImpl();
    },
    stop: async () => {
      calls.stop += 1;
    },
  };
  return { source, calls };
};

const track = buildTrack(deauvilleMarathonGeometry.points);
const course = CourseSchema.parse({ id: 'c', raceId: 'r', distanceKey: '5k', distanceM: 5000, landmarks: deauvilleMarathonLandmarks });

describe('run store with the simulation source', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useRun.getState().reset();
    vi.useRealTimers();
  });

  it('counts down, runs a 5 km at 5:00/km in accelerated time, fires audio and finishes', async () => {
    const store = useRun.getState();
    store.prepare(course, track, packV0(course));
    const source = simulationSource({ track, targetM: 5500, pace: constantPace(300), speedFactor: 100, noiseM: 0 });
    const started = store.start(source, 3);
    expect(useRun.getState().phase).toBe('countdown');
    await vi.advanceTimersByTimeAsync(1100);
    await started;
    expect(useRun.getState().phase).toBe('running');
    expect(useRun.getState().fired.map((f) => f.key)).toEqual(['ceremony.start']);

    // 25 minutes of race at x100 is 15 s of wall clock.
    await vi.advanceTimersByTimeAsync(20_000);
    const { state, phase, fired } = useRun.getState();
    expect(phase).toBe('finished');
    expect(state.distanceM).toBe(5000);
    expect(Math.abs(state.elapsedMs - 25 * 60 * 1000)).toBeLessThan(10_000);
    expect(state.splits).toHaveLength(5);
    const keys = fired.map((f) => f.key);
    expect(keys).toContain('course.planches');
    expect(keys).toContain('course.touques');
    expect(keys).toContain('personal.split#3');
    expect(keys[keys.length - 1]).toBe('ceremony.finish');
  });

  it('the simulation clock runs faster than the wall clock', () => {
    const source = simulationSource({ track, targetM: 1000, speedFactor: 10 });
    const t0 = source.now();
    vi.advanceTimersByTime(1000);
    expect(source.now() - t0).toBeCloseTo(10_000, -2);
  });

  it('a pack arriving mid-run does not wipe the run', async () => {
    const store = useRun.getState();
    store.prepare(course, track, packV0(course));
    const source = simulationSource({ track, targetM: 5500, pace: constantPace(300), speedFactor: 100, noiseM: 0 });
    await Promise.all([store.start(source, 1), vi.advanceTimersByTimeAsync(1100)]);
    await vi.advanceTimersByTimeAsync(3000);
    const before = useRun.getState().state.distanceM;
    expect(before).toBeGreaterThan(0);
    useRun.getState().prepare(course, track, { ...packV0(course), version: 2 });
    expect(useRun.getState().phase).toBe('running');
    expect(useRun.getState().state.distanceM).toBe(before);
  });

  it('stopping before the distance is an abandon, not a finish', async () => {
    const store = useRun.getState();
    store.prepare(course, track, packV0(course));
    const source = simulationSource({ track, targetM: 5500, pace: constantPace(300), speedFactor: 100, noiseM: 0 });
    await Promise.all([store.start(source, 1), vi.advanceTimersByTimeAsync(1100)]);
    await vi.advanceTimersByTimeAsync(3000);
    await useRun.getState().stop();
    expect(useRun.getState().phase).toBe('finished');
    expect(useRun.getState().state.phase).toBe('abandoned');
  });

  it('leaving during the countdown never starts the GPS', async () => {
    useRun.getState().prepare(course, track, packV0(course));
    const { source, calls } = fakeSource();
    const started = useRun.getState().start(source, 5);
    await vi.advanceTimersByTimeAsync(2000);
    useRun.getState().reset();
    await vi.advanceTimersByTimeAsync(5000);
    await started;
    expect(calls.start).toBe(0);
    expect(useRun.getState().phase).toBe('idle');
  });

  it('a refused location permission puts the runner back on the start screen', async () => {
    useRun.getState().prepare(course, track, packV0(course));
    const { source } = fakeSource(async () => {
      throw new Error('location_denied');
    });
    await Promise.all([useRun.getState().start(source, 1), vi.advanceTimersByTimeAsync(1100)]);
    expect(useRun.getState().phase).toBe('idle');
    expect(useRun.getState().startError).toBe('location_denied');
  });
});
