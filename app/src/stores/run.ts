import { create } from 'zustand';
import { applySample, abandon as abandonRun, idleRun, nextEvents, startRun, tick } from '@sivoov/shared';
import type { AudioEvent, AudioPack, Course, CourseTrack, Firing, LocationSample, RunState } from '@sivoov/shared';
import type { LocationSource } from '@/services/location';

export type Fired = { eventId: string; key: string; distanceM: number; elapsedMs: number };

type RunStore = {
  phase: 'idle' | 'countdown' | 'running' | 'finished';
  course: Course | null;
  track: CourseTrack | null;
  pack: AudioPack | null;
  state: RunState;
  source: LocationSource | null;
  samples: LocationSample[];
  fired: Fired[];
  /** The last event fired, for the on-screen caption until real audio plays. */
  nowPlaying: AudioEvent | null;
  countdown: number;
  prepare: (course: Course, track: CourseTrack, pack: AudioPack) => void;
  /** Countdown, then the gun. */
  start: (source: LocationSource, countdownSeconds?: number) => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
};

const SIM_COUNTDOWN_MS = 1000;

export const useRun = create<RunStore>((set, get) => {
  let timer: ReturnType<typeof setInterval> | null = null;

  const fire = (firings: Firing[], state: RunState) => {
    if (firings.length === 0) return;
    const { fired } = get();
    const records = firings.map((f) => ({ eventId: f.event.id, key: f.key, distanceM: state.distanceM, elapsedMs: state.elapsedMs }));
    set({ fired: [...fired, ...records], nowPlaying: firings[0]!.event });
  };

  const onState = (state: RunState) => {
    const { pack, fired } = get();
    set({ state, phase: state.phase === 'finished' ? 'finished' : 'running' });
    if (pack) fire(nextEvents(state, pack, new Set(fired.map((f) => f.key))), state);
    if (state.phase === 'finished') void get().stop();
  };

  return {
    phase: 'idle',
    course: null,
    track: null,
    pack: null,
    state: idleRun(0),
    source: null,
    samples: [],
    fired: [],
    nowPlaying: null,
    countdown: 0,

    prepare(course, track, pack) {
      set({ course, track, pack, state: idleRun(course.distanceM), phase: 'idle', samples: [], fired: [], nowPlaying: null });
    },

    async start(source, countdownSeconds = 5) {
      const { course } = get();
      if (!course) throw new Error('prepare() first');
      set({ source, phase: 'countdown', countdown: countdownSeconds });
      const stepMs = source.kind === 'simulation' ? SIM_COUNTDOWN_MS / countdownSeconds : 1000;
      await new Promise<void>((resolve) => {
        const id = setInterval(() => {
          const c = get().countdown - 1;
          set({ countdown: c });
          if (c <= 0) {
            clearInterval(id);
            resolve();
          }
        }, stepMs);
      });
      onState(startRun(idleRun(course.distanceM), source.now()));
      await source.start((sample) => {
        const { state } = get();
        if (state.phase !== 'running') return;
        set({ samples: [...get().samples, sample] });
        onState(applySample(state, sample));
      });
      timer = setInterval(() => {
        const { state, phase } = get();
        if (phase === 'running') set({ state: tick(state, source.now()) });
      }, 250);
    },

    async stop() {
      const { source, state } = get();
      if (timer) clearInterval(timer);
      timer = null;
      await source?.stop();
      if (state.phase === 'running') set({ state: abandonRun(state), phase: 'finished' });
    },

    reset() {
      void get().stop();
      const { course } = get();
      set({ state: idleRun(course?.distanceM ?? 0), phase: 'idle', samples: [], fired: [], nowPlaying: null, source: null });
    },
  };
});
