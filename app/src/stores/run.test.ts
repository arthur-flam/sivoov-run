import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPackSchema, buildTrack, constantPace, deauvilleMarathonGeometry, parseJournalSamples, recoveryFor, RunJournalSchema, simulateRun } from '@sivoov/shared';
import { CourseSchema, deauvilleMarathonLandmarks } from '@sivoov/shared';
import type { AudioPack, CueMoment, LocationSample } from '@sivoov/shared';
import { packV0 } from '@/audio/pack';
import { simulationSource } from '@/services/location/simulation';
import type { LocationSource } from '@/services/location';

/** The journal on "disk": the same text files the phone keeps, in memory. */
const disk = vi.hoisted(() => ({ meta: null as string | null, samples: '' }));
vi.mock('@/stores/journalFiles', async () => {
  const { journalLine, parseJournalSamples, RunJournalSchema } = await import('@sivoov/shared');
  const readMeta = async () => (disk.meta === null ? null : RunJournalSchema.parse(JSON.parse(disk.meta)));
  return {
    journalFiles: {
      open: async (journal: unknown) => {
        disk.meta = JSON.stringify(journal);
        disk.samples = '';
      },
      writeMeta: async (journal: unknown) => {
        disk.meta = JSON.stringify(journal);
      },
      append: async (samples: Parameters<typeof journalLine>[0][]) => {
        disk.samples += samples.map(journalLine).join('');
      },
      readMeta,
      read: async () => {
        const journal = await readMeta();
        return journal ? { journal, samples: parseJournalSamples(disk.samples) } : null;
      },
      clear: async () => {
        disk.meta = null;
        disk.samples = '';
      },
    },
  };
});

const { useRun } = await import('./run');

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

  it('calls the runner by name on the line when their own version came down with the pack', async () => {
    const { source } = fakeSource();
    const own = (event: { id: string; source: { kind: string; key?: string } }) => (event.id === 'intro' ? 'file://voices/lea-intro.mp3' : event.source.kind === 'file' ? uriFor(event.source.key!) : null);
    const started = useRun.getState().start(source, { soundFor: own });
    expect(playing('file://voices/lea-intro.mp3')).toBeDefined();
    expect(playing('file://intro.mp3')).toBeUndefined();
    useRun.getState().reset();
    await started;
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

/** A device-like source that hands the run fixes the test decides, on the wall clock. */
const scriptedSource = () => {
  let listener: ((sample: LocationSample) => void) | null = null;
  const source: LocationSource = {
    kind: 'device',
    now: () => Date.now(),
    start: async (onSample) => {
      listener = onSample;
    },
    stop: async () => {
      listener = null;
    },
  };
  return { source, feed: (sample: LocationSample) => listener?.(sample) };
};

describe('a run that survives the app', () => {
  const T0 = Date.UTC(2026, 10, 14, 8, 0, 0);
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
    disk.meta = null;
    disk.samples = '';
    useRun.getState().prepare(course, track, packV0(course));
  });
  afterEach(() => {
    useRun.getState().reset();
    vi.useRealTimers();
  });

  /** 5:00/km along the course from the gun, one fix a second. */
  const fixes = (gun: number) => simulateRun({ track, targetM: 5500, pace: constantPace(300), startTime: gun + 500, noiseM: 3, seed: 11 });

  /** Runs `minutes` of a 5 km with the journal on, as the phone would. */
  const runFor = async (minutes: number) => {
    const { source, feed } = scriptedSource();
    await Promise.all([useRun.getState().start(source, { countdownSeconds: 1, entrantId: 'e1' }), vi.advanceTimersByTimeAsync(1100)]);
    const gun = useRun.getState().state.startedAt!;
    const all = fixes(gun);
    const upTo = all.filter((s) => s.timestamp <= gun + minutes * 60_000);
    for (const sample of upTo) {
      vi.setSystemTime(sample.timestamp);
      feed(sample);
    }
    await vi.advanceTimersByTimeAsync(11_000);
    return { gun, all, upTo };
  };

  it('keeps the run on disk as it goes: the gun, the runner, every fix but the last few seconds, what was said', async () => {
    const { gun, upTo } = await runFor(12);
    const journal = RunJournalSchema.parse(JSON.parse(disk.meta!));
    expect(journal).toMatchObject({ runId: useRun.getState().runId, entrantId: 'e1', courseId: 'c', targetM: 5000, startedAt: gun });
    // Fixes go to disk every ten seconds: a crash costs at most that, bridged by a straight line.
    const kept = parseJournalSamples(disk.samples);
    expect(upTo.length - kept.length).toBeLessThanOrEqual(10);
    expect(kept).toEqual(upTo.slice(0, kept.length));
    expect(journal.fired.map((f) => f.key)).toEqual(useRun.getState().fired.map((f) => f.key));
    // The gun's own line too: the journal opens before it fires.
    expect(journal.fired[0]?.key).toBe('ceremony.start');
  });

  it('a killed app comes back to the same run: same id, same distance, nothing said twice, the clock never stopped', async () => {
    const { gun, all, upTo } = await runFor(12);
    const before = useRun.getState();
    const heardBefore = before.fired.map((f) => f.key);
    // The app dies. Six minutes later the runner opens it again.
    const lastFix = upTo[upTo.length - 1]!.timestamp;
    vi.setSystemTime(lastFix + 6 * 60_000);
    useRun.getState().reset();
    useRun.getState().prepare(course, track, packV0(course));
    const found = RunJournalSchema.parse(JSON.parse(disk.meta!));
    const recovery = recoveryFor(found, parseJournalSamples(disk.samples), Date.now());
    expect(recovery.kind).toBe('resume');
    useRun.getState().restore({ journal: found, samples: parseJournalSamples(disk.samples), state: recovery.state });
    expect(useRun.getState()).toMatchObject({ phase: 'recovered', runId: before.runId });
    // Up to the last ten seconds were still in memory when it died.
    expect(before.state.distanceM - useRun.getState().state.distanceM).toBeLessThan(40);
    expect(useRun.getState().fired.every((f) => f.silent)).toBe(true);

    const { source, feed } = scriptedSource();
    await useRun.getState().resume(source);
    expect(useRun.getState().phase).toBe('running');
    expect(useRun.getState().state.elapsedMs).toBe(Date.now() - gun);
    // Six minutes dark was about 1.2 km: the km call that fell due then is not said late.
    all.filter((s) => s.timestamp > Date.now()).slice(0, 30).forEach((sample) => {
      vi.setSystemTime(sample.timestamp);
      feed(sample);
    });
    const after = useRun.getState();
    expect(after.state.distanceM).toBeGreaterThan(before.state.distanceM + 500);
    const newlySaid = after.fired.filter((f) => !f.silent).map((f) => f.key);
    expect(newlySaid.filter((k) => heardBefore.includes(k))).toEqual([]);
    expect(after.fired.filter((f) => f.missed).length).toBeGreaterThan(0);
    // The journal remembers what was missed: a second crash would not count it as heard.
    await vi.advanceTimersByTimeAsync(0);
    const kept = RunJournalSchema.parse(JSON.parse(disk.meta!)).fired;
    expect(kept.filter((f) => f.missed).map((f) => f.key)).toEqual(after.fired.filter((f) => f.missed).map((f) => f.key));
  });

  it('a runner who stops a recovered run gets it closed as it stood, under the same id', async () => {
    await runFor(6);
    const id = useRun.getState().runId;
    useRun.getState().reset();
    useRun.getState().prepare(course, track, packV0(course));
    const found = RunJournalSchema.parse(JSON.parse(disk.meta!));
    useRun.getState().restore({ journal: found, samples: parseJournalSamples(disk.samples), state: recoveryFor(found, parseJournalSamples(disk.samples), Date.now()).state });
    await useRun.getState().stop();
    expect(useRun.getState()).toMatchObject({ phase: 'finished', runId: id });
    expect(useRun.getState().state.phase).toBe('abandoned');
    expect(useRun.getState().state.distanceM).toBeGreaterThan(1000);
  });

  it('forgets the journal once the upload is queued, and a late stop cannot write it back', async () => {
    await runFor(3);
    await useRun.getState().stop();
    expect(RunJournalSchema.parse(JSON.parse(disk.meta!)).stoppedAt).toBeDefined();
    await useRun.getState().forget();
    await useRun.getState().stop();
    expect(disk.meta).toBeNull();
  });

  it('backing out of a recovered run leaves nothing behind: no finish to upload, the journal kept', async () => {
    await runFor(3);
    useRun.getState().reset();
    useRun.getState().prepare(course, track, packV0(course));
    const found = RunJournalSchema.parse(JSON.parse(disk.meta!));
    const samples = parseJournalSamples(disk.samples);
    useRun.getState().restore({ journal: found, samples, state: recoveryFor(found, samples, Date.now()).state });
    useRun.getState().reset();
    await vi.advanceTimersByTimeAsync(1000);
    expect(useRun.getState().phase).toBe('idle');
    expect(disk.meta).not.toBeNull();
  });

  it('never journals a simulation', async () => {
    const source = simulationSource({ track, targetM: 5500, pace: constantPace(300), speedFactor: 100, noiseM: 0 });
    await Promise.all([useRun.getState().start(source, { countdownSeconds: 1, entrantId: 'e1' }), vi.advanceTimersByTimeAsync(1100)]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(disk.meta).toBeNull();
  });

  it('does not redraw the clock while the app is in the background, and catches up on return', async () => {
    await runFor(1);
    useRun.getState().setVisible(false);
    const frozen = useRun.getState().state.elapsedMs;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(useRun.getState().state.elapsedMs).toBe(frozen);
    useRun.getState().setVisible(true);
    expect(useRun.getState().state.elapsedMs).toBeGreaterThanOrEqual(frozen + 60_000);
  });
});
