import { create } from 'zustand';
import { applySample, abandon as abandonRun, idleRun, nextEvents, startRun, tick } from '@sivoov/shared';
import type { AudioEvent, AudioPack, Course, CourseTrack, Firing, LocationSample, RunState } from '@sivoov/shared';
import { ceremonyPlan, playCeremony } from '@/audio/ceremony';
import type { Ceremony, CeremonyPlan } from '@/audio/ceremony';
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
  /** The digit on screen during the countdown. */
  countdown: number;
  /**
   * Where the start ceremony is: 'armed' while the lines before the countdown play (no digits
   * yet), 'countdown' while the countdown file plays and `countdown` follows it; null for the
   * silent visual countdown.
   */
  cue: 'armed' | 'countdown' | null;
  /** Why the last start did not get going ('location_denied', ...); cleared by the next start. */
  startError: string | null;
  /** Sets the run up. A no-op once the countdown has begun: a late pack never wipes a run. */
  prepare: (course: Course, track: CourseTrack, pack: AudioPack) => void;
  /**
   * The start ceremony when the pack has one and every file of it resolves through `uriFor`,
   * the silent visual countdown otherwise; then the gun. Simulation always takes the short
   * visual countdown, so accelerated runs stay fast.
   */
  start: (source: LocationSource, options?: StartOptions) => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
};

type StartOptions = { uriFor?: (key: string) => string | null; countdownSeconds?: number };

const SIM_COUNTDOWN_MS = 1000;

export const useRun = create<RunStore>((set, get) => {
  let timer: ReturnType<typeof setInterval> | null = null;
  /** Bumped by reset(): a start() still in its countdown sees it and gives up. */
  let generation = 0;
  /** The start ceremony while it plays; the gun line may still be sounding once the run is on. */
  let ceremony: Ceremony | null = null;

  /** Resolves with the gun's time, or null when the ceremony failed before it (or was stopped). */
  const playPlan = (plan: CeremonyPlan, source: LocationSource): Promise<number | null> => {
    ceremony = playCeremony(plan, () => source.now(), (cue) => set(cue.at === 'countdown' ? { cue: cue.at, countdown: cue.seconds } : { cue: cue.at }));
    return ceremony.gun;
  };

  /** The silent countdown: one digit a second, or one second in all for a simulation. */
  const visualCountdown = (source: LocationSource, seconds: number, current: () => boolean): Promise<void> => {
    set({ cue: null, countdown: seconds });
    const stepMs = source.kind === 'simulation' ? SIM_COUNTDOWN_MS / seconds : 1000;
    return new Promise<void>((resolve) => {
      const id = setInterval(() => {
        if (!current()) {
          clearInterval(id);
          resolve();
          return;
        }
        const c = get().countdown - 1;
        set({ countdown: c });
        if (c <= 0) {
          clearInterval(id);
          resolve();
        }
      }, stepMs);
    });
  };

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
    cue: null,
    startError: null,

    prepare(course, track, pack) {
      if (get().phase !== 'idle') return;
      set({ course, track, pack, state: idleRun(course.distanceM), phase: 'idle', samples: [], fired: [], nowPlaying: null, cue: null });
    },

    async start(source, { uriFor = () => null, countdownSeconds = 5 } = {}) {
      const { course, pack } = get();
      if (!course) throw new Error('prepare() first');
      const mine = ++generation;
      const current = () => generation === mine;
      const plan = source.kind === 'simulation' ? null : ceremonyPlan(pack, uriFor);
      set({ source, phase: 'countdown', countdown: countdownSeconds, cue: plan ? 'armed' : null, startError: null });
      // The clock starts when the gun file starts playing, not when a timer ends.
      const gunAt = plan ? await playPlan(plan, source) : null;
      if (!current()) return;
      if (gunAt === null) await visualCountdown(source, countdownSeconds, current);
      if (!current()) return;
      onState(startRun(idleRun(course.distanceM), gunAt ?? source.now()));
      try {
        await source.start((sample) => {
          const { state } = get();
          if (!current() || state.phase !== 'running') return;
          set({ samples: [...get().samples, sample] });
          onState(applySample(state, sample));
        });
      } catch (e) {
        await source.stop().catch(() => undefined);
        if (!current()) return;
        ceremony?.stop();
        ceremony = null;
        set({ state: idleRun(course.distanceM), phase: 'idle', samples: [], fired: [], nowPlaying: null, source: null, cue: null, startError: e instanceof Error ? e.message : String(e) });
        return;
      }
      // The screen left while the GPS was starting: nothing may keep it on.
      if (!current()) {
        await source.stop();
        return;
      }
      timer = setInterval(() => {
        const { state, phase } = get();
        if (phase === 'running') set({ state: tick(state, source.now()) });
      }, 250);
    },

    async stop() {
      const { source, state } = get();
      if (timer) clearInterval(timer);
      timer = null;
      ceremony?.stop();
      ceremony = null;
      await source?.stop();
      if (state.phase === 'running') set({ state: abandonRun(state), phase: 'finished' });
    },

    reset() {
      generation += 1;
      void get().stop();
      const { course } = get();
      set({ state: idleRun(course?.distanceM ?? 0), phase: 'idle', samples: [], fired: [], nowPlaying: null, source: null, cue: null });
    },
  };
});
