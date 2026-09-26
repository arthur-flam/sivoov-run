import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPackSchema, buildTrack, constantPace, deauvilleMarathonGeometry } from '@sivoov/shared';
import { CourseSchema, deauvilleMarathonLandmarks } from '@sivoov/shared';
import type { AudioPack, CueMoment } from '@sivoov/shared';
import { packV0 } from '@/audio/pack';
import { simulationSource } from '@/services/location/simulation';
import type { LocationSource } from '@/services/location';
import { useRun } from './run';

/** expo-audio at the boundary: one fake player per file, whose status the test drives. */
type Listener = (status: Record<string, unknown>) => void;
type FakePlayer = { uri: string; removed: boolean; emit: Listener };
const players: FakePlayer[] = [];
vi.mock('expo-audio', () => ({
  setAudioModeAsync: async () => undefined,
  createAudioPlayer: ({ uri }: { uri: string }) => {
    const p: FakePlayer = { uri, removed: false, emit: () => undefined };
    players.push(p);
    return {
      play: () => undefined,
      remove: () => {
        p.removed = true;
      },
      addListener: (_event: string, listener: Listener) => {
        p.emit = listener;
      },
      removeAllListeners: () => {
        p.emit = () => undefined;
      },
    };
  },
}));
const status = (s: Record<string, unknown>) => ({ didJustFinish: false, playbackState: 'ready', isLoaded: true, duration: 0, currentTime: 0, playing: false, ...s });
const playing = (uri: string) => players.find((p) => p.uri === uri && !p.removed);

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

const cue = (id: string, at: CueMoment) => ({ id, trigger: { kind: 'cue', at, order: 1 }, source: { kind: 'file', key: `${id}.mp3` }, mix: 'wait', priority: 10, category: 'ceremony' });
/** A published pack with a start ceremony, and no line left to fire at the gun. */
const ceremonyPack = (): AudioPack =>
  AudioPackSchema.parse({
    ...packV0(course),
    version: 2,
    events: [...packV0(course).events.filter((e) => e.trigger.kind !== 'start'), cue('gun', 'gun'), cue('countdown', 'countdown'), cue('intro', 'armed')],
  });
const uriFor = (key: string) => `file://${key}`;

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
    const started = store.start(source, { countdownSeconds: 3 });
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
    await Promise.all([store.start(source, { countdownSeconds: 1 }), vi.advanceTimersByTimeAsync(1100)]);
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
    await Promise.all([store.start(source, { countdownSeconds: 1 }), vi.advanceTimersByTimeAsync(1100)]);
    await vi.advanceTimersByTimeAsync(3000);
    await useRun.getState().stop();
    expect(useRun.getState().phase).toBe('finished');
    expect(useRun.getState().state.phase).toBe('abandoned');
  });

  it('leaving during the countdown never starts the GPS', async () => {
    useRun.getState().prepare(course, track, packV0(course));
    const { source, calls } = fakeSource();
    const started = useRun.getState().start(source, { countdownSeconds: 5 });
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
    await Promise.all([useRun.getState().start(source, { countdownSeconds: 1 }), vi.advanceTimersByTimeAsync(1100)]);
    expect(useRun.getState().phase).toBe('idle');
    expect(useRun.getState().startError).toBe('location_denied');
  });
});

describe('the start ceremony', () => {
  beforeEach(() => {
    players.length = 0;
    vi.useFakeTimers();
    useRun.getState().prepare(course, track, ceremonyPack());
  });
  afterEach(() => {
    useRun.getState().reset();
    vi.useRealTimers();
  });

  it('plays the intro on the line, counts down with the countdown file, and starts the clock on the gun', async () => {
    const { source, calls } = fakeSource();
    const started = useRun.getState().start(source, { uriFor });
    // Before a word is heard: the calm state, no digits.
    expect(useRun.getState()).toMatchObject({ phase: 'countdown', cue: 'armed' });
    playing('file://intro.mp3')!.emit(status({ duration: 20, playing: true }));
    vi.advanceTimersByTime(20_000);
    playing('file://intro.mp3')!.emit(status({ didJustFinish: true }));

    // The digits are the countdown file's own remaining seconds.
    playing('file://countdown.mp3')!.emit(status({ duration: 10, playing: true }));
    expect(useRun.getState()).toMatchObject({ phase: 'countdown', cue: 'countdown', countdown: 10 });
    vi.advanceTimersByTime(3400);
    playing('file://countdown.mp3')!.emit(status({ duration: 10, currentTime: 3.4, playing: true }));
    expect(useRun.getState().countdown).toBe(7);
    vi.advanceTimersByTime(6600);
    playing('file://countdown.mp3')!.emit(status({ didJustFinish: true }));
    expect(useRun.getState().phase).toBe('countdown');

    // "Partez !" and 0:00 are the same instant, dated from the gun file itself.
    vi.advanceTimersByTime(200);
    const heardAt = Date.now();
    playing('file://gun.mp3')!.emit(status({ duration: 2, currentTime: 0.2, playing: true }));
    await started;
    expect(useRun.getState().phase).toBe('running');
    expect(useRun.getState().state.startedAt).toBe(heardAt - 200);
    expect(calls.start).toBe(1);
    // Nothing of the ceremony fires again once the run is on.
    expect(useRun.getState().fired).toEqual([]);
  });

  it('keeps the silent countdown when a ceremony file is missing: never half a ceremony', async () => {
    const { source } = fakeSource();
    const started = useRun.getState().start(source, { uriFor: (key) => (key === 'countdown.mp3' ? null : uriFor(key)) });
    expect(useRun.getState()).toMatchObject({ phase: 'countdown', cue: null, countdown: 5 });
    await vi.advanceTimersByTimeAsync(5000);
    await started;
    expect(useRun.getState().phase).toBe('running');
    expect(players).toEqual([]);
  });

  it('falls back to the silent countdown when a line before the gun never loads', async () => {
    const { source } = fakeSource();
    const started = useRun.getState().start(source, { uriFor });
    await vi.advanceTimersByTimeAsync(8000);
    expect(useRun.getState()).toMatchObject({ phase: 'countdown', cue: null, countdown: 5 });
    await vi.advanceTimersByTimeAsync(5000);
    await started;
    expect(useRun.getState().phase).toBe('running');
  });

  it('starts the race at once when only the gun file fails: the countdown was heard', async () => {
    const { source } = fakeSource();
    const started = useRun.getState().start(source, { uriFor });
    playing('file://intro.mp3')!.emit(status({ didJustFinish: true }));
    playing('file://countdown.mp3')!.emit(status({ didJustFinish: true }));
    const failedAt = Date.now();
    playing('file://gun.mp3')!.emit(status({ playbackState: 'failed', isLoaded: false }));
    await started;
    expect(useRun.getState().phase).toBe('running');
    expect(useRun.getState().state.startedAt).toBe(failedAt);
  });

  it('leaving during the ceremony silences it and never starts the GPS', async () => {
    const { source, calls } = fakeSource();
    const started = useRun.getState().start(source, { uriFor });
    playing('file://intro.mp3')!.emit(status({ duration: 20, playing: true }));
    useRun.getState().reset();
    await started;
    expect(players.every((p) => p.removed)).toBe(true);
    expect(players).toHaveLength(1);
    expect(calls.start).toBe(0);
    expect(useRun.getState()).toMatchObject({ phase: 'idle', cue: null });
  });

  it('skips the ceremony in simulation, so accelerated runs stay fast', async () => {
    const source = simulationSource({ track, targetM: 5500, pace: constantPace(300), speedFactor: 100, noiseM: 0 });
    await Promise.all([useRun.getState().start(source, { uriFor }), vi.advanceTimersByTimeAsync(1100)]);
    expect(useRun.getState().phase).toBe('running');
    expect(players).toEqual([]);
  });
});
