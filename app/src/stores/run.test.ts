import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrack, constantPace, deauvilleMarathonGeometry } from '@sivoov/shared';
import { CourseSchema, deauvilleMarathonLandmarks } from '@sivoov/shared';
import { packV0 } from '@/audio/pack';
import { simulationSource } from '@/services/location/simulation';
import { useRun } from './run';

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
});
