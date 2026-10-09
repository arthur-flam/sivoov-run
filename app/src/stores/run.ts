import { create } from 'zustand';
import { NO_PAUSE, afterPause, applySample, abandon as abandonRun, bridgedGap, dueLines, followPause, idleRun, nextEvents, startRun, tick } from '@sivoov/shared';
import type { AudioEvent, AudioPack, Course, CourseTrack, Due, Firing, LocationSample, Pause, RunJournal, RunState } from '@sivoov/shared';
import { ceremonyPlan, playCeremony } from '@/audio/ceremony';
import type { Ceremony, CeremonyHandlers, CeremonyPlan } from '@/audio/ceremony';
import { diag } from '@/diag';
import type { LocationSource } from '@/services/location';
import { journalFiles } from './journalFiles';
import { newRunId } from './runId';
import { createJournalWriter } from './runJournal';

/**
 * A line the run fired. `take`: which of the line's takes it says (none: its own words). `silent`:
 * already dealt with, the player must not say it (a resumed run's lines from before the crash,
 * and the backlog it missed). `missed`: never heard at all, so it is left out of the trace's
 * record of what the runner heard.
 */
export type Fired = { eventId: string; key: string; take?: string; distanceM: number; elapsedMs: number; silent?: boolean; missed?: boolean };

/** A run found on the phone when the app came back, before the runner chose to carry on or to stop. */
export type Recovered = { journal: RunJournal; samples: LocationSample[]; state: RunState };

type RunStore = {
  /** 'recovered': a run rebuilt from its journal, waiting for the runner to resume or stop it. */
  phase: 'idle' | 'countdown' | 'running' | 'recovered' | 'finished';
  /** The run's id from its first second: the journal, the upload and a screen coming back all use it. */
  runId: string;
  course: Course | null;
  track: CourseTrack | null;
  pack: AudioPack | null;
  state: RunState;
  source: LocationSource | null;
  samples: LocationSample[];
  fired: Fired[];
  /** The last event fired, for the on-screen caption until real audio plays. */
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
  /** The journal of a recovered run, until it is resumed or stopped. */
  recovered: RunJournal | null;
  /** Sets the run up. A no-op once the countdown has begun: a late pack never wipes a run. */
  prepare: (course: Course, track: CourseTrack, pack: AudioPack) => void;
  /**
   * The start ceremony when the pack has one and every line of it has a sound (`soundFor`, or
   * the pack file by key through `uriFor`),
   * the silent visual countdown otherwise; then the gun. A simulation takes the short visual
   * countdown, so accelerated runs stay fast, unless it asks for the ceremony (`ceremony`: the
   * course heard in ten minutes, which would otherwise open in silence).
   */
  start: (source: LocationSource, options?: StartOptions) => Promise<void>;
  /**
   * Loads a run found in its journal (`recoveryFor` said 'resume'). Needs `prepare()` first, for
   * the pack. Everything it fired before is marked silent: nothing is said twice.
   */
  restore: (recovered: Recovered) => void;
  /**
   * Carries a restored run on: the GPS again, from where the runner is now. The clock never
   * stopped. The lines that fell due while the phone was dark are dropped, except the finish.
   */
  resume: (source: LocationSource) => Promise<void>;
  stop: () => Promise<void>;
  /** The run's upload is queued: its journal goes, and nothing written late can bring it back. */
  forget: () => Promise<void>;
  reset: () => void;
  /** The app is on screen or not: the clock redraws the screen only when someone can see it. */
  setVisible: (visible: boolean) => void;
};

/**
 * `onLine`: each line of the start ceremony as it starts (null when it falls silent), for its caption.
 * `entrantId`: whose run it is, for the journal (no journal without it, and never for a simulation).
 */
type StartOptions = {
  uriFor?: (key: string) => string | null;
  soundFor?: (event: AudioEvent) => string | null;
  countdownSeconds?: number;
  onLine?: CeremonyHandlers['onLine'];
  entrantId?: string;
  /** A simulation plays the start ceremony too. */
  ceremony?: boolean;
};

const SIM_COUNTDOWN_MS = 1000;

export const useRun = create<RunStore>((set, get) => {
  let timer: ReturnType<typeof setInterval> | null = null;
  /** Bumped by reset(): a start() still in its countdown sees it and gives up. */
  let generation = 0;
  /** The start ceremony while it plays; the gun line may still be sounding once the run is on. */
  let ceremony: Ceremony | null = null;
  /** The run on disk as it goes, so a killed app or a restarted phone loses nothing. */
  const journal = createJournalWriter();
  /** Off while the app is in the background: nobody sees the clock, and the phone is spared the work. */
  let visible = true;
  /** The runner's stops and walks (`followPause`), for a word when they run again. From scratch at every start and resume. */
  let pause: Pause = NO_PAUSE;

  /** Resolves with the gun's time, or null when the ceremony failed before it (or was stopped). */
  const playPlan = (plan: CeremonyPlan, source: LocationSource, onLine: CeremonyHandlers['onLine']): Promise<number | null> => {
    const onCue: CeremonyHandlers['onCue'] = (cue) => set(cue.at === 'countdown' ? { cue: cue.at, countdown: cue.seconds } : { cue: cue.at });
    ceremony = playCeremony(plan, () => source.now(), { onCue, onLine });
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

  /** `late`: the run just crossed a long silence; what fell due in it is marked missed, never said (bar the finish). */
  const fire = (due: Due[], state: RunState, late: boolean) => {
    if (due.length === 0) return;
    const { fired } = get();
    const kept = new Set<Firing>(late ? afterPause(due) : due);
    const said = due.filter((d) => kept.has(d));
    const record = (d: Due): Fired => ({ eventId: d.event.id, key: d.key, ...(d.take ? { take: d.take } : {}), distanceM: state.distanceM, elapsedMs: state.elapsedMs });
    const missed = due.filter((d) => !kept.has(d)).map((d) => ({ ...record(d), silent: true, missed: true }));
    if (missed.length > 0) diag('run', `${missed.length} lines missed across a GPS gap at ${Math.round(state.distanceM)} m`);
    set({ fired: [...fired, ...missed, ...said.map(record)] });
    void journal.fired(get().fired);
  };

  /**
   * Every new state of the run: the runner's stops followed, then what is due now (shared
   * `dueLines`): the lines placed on the course with the take each says, or one filler when the
   * race has been quiet too long. Everything fired so far, restored lines included, is what was
   * said: takes go round their pool from where they were.
   */
  const onState = (state: RunState, late = false) => {
    const { pack, fired } = get();
    pause = followPause(pause, state);
    set({ state, phase: state.phase === 'finished' ? 'finished' : 'running' });
    if (pack) fire(dueLines(state, pack, fired, pause), state, late);
    if (state.phase === 'finished') void get().stop();
  };

  /**
   * Starts the GPS into the running run, then the clock. Null once listening; otherwise why not
   * (the source is stopped again). A screen gone meanwhile stops it too.
   */
  const listen = async (source: LocationSource, current: () => boolean): Promise<string | null> => {
    try {
      await source.start((sample) => {
        const { state } = get();
        if (!current() || state.phase !== 'running') return;
        set({ samples: [...get().samples, sample] });
        journal.add(sample);
        const next = applySample(state, sample);
        onState(next, bridgedGap(state, next));
      });
    } catch (e) {
      await source.stop().catch(() => undefined);
      return e instanceof Error ? e.message : String(e);
    }
    // The screen left while the GPS was starting: nothing may keep it on.
    if (!current()) {
      await source.stop();
      return null;
    }
    timer = setInterval(() => {
      const { state, phase } = get();
      if (phase === 'running' && visible) set({ state: tick(state, source.now()) });
    }, 250);
    return null;
  };

  return {
    phase: 'idle',
    runId: newRunId(),
    course: null,
    track: null,
    pack: null,
    state: idleRun(0),
    source: null,
    samples: [],
    fired: [],
    countdown: 0,
    cue: null,
    startError: null,
    recovered: null,

    prepare(course, track, pack) {
      if (get().phase !== 'idle') return;
      set({ course, track, pack, state: idleRun(course.distanceM), phase: 'idle', samples: [], fired: [], cue: null });
    },

    async start(source, { uriFor = () => null, soundFor, countdownSeconds = 5, onLine, entrantId, ceremony: simCeremony = false } = {}) {
      const { course, pack } = get();
      if (!course) throw new Error('prepare() first');
      const mine = ++generation;
      const current = () => generation === mine;
      const resolve = soundFor ?? ((event: AudioEvent) => (event.source.kind === 'file' ? uriFor(event.source.key) : null));
      const plan = source.kind === 'simulation' && !simCeremony ? null : ceremonyPlan(pack, resolve, uriFor);
      set({ source, phase: 'countdown', countdown: countdownSeconds, cue: plan ? 'armed' : null, startError: null });
      // The clock starts when the gun file starts playing, not when a timer ends.
      const gunAt = plan ? await playPlan(plan, source, onLine) : null;
      if (!current()) return;
      if (gunAt === null) await visualCountdown(source, countdownSeconds, current);
      if (!current()) return;
      const gun = startRun(idleRun(course.distanceM), gunAt ?? source.now());
      const runId = newRunId();
      set({ runId });
      // Open before the gun's own lines fire, so they are in it.
      if (entrantId && source.kind !== 'simulation' && gun.startedAt !== null) {
        void journal.open({ version: 1, runId, entrantId, courseId: course.id, targetM: course.distanceM, startedAt: gun.startedAt, updatedAt: gun.startedAt, fired: [] });
      }
      pause = NO_PAUSE;
      onState(gun);
      const error = await listen(source, current);
      if (error === null || !current()) return;
      ceremony?.stop();
      ceremony = null;
      await journal.close();
      set({ state: idleRun(course.distanceM), phase: 'idle', samples: [], fired: [], source: null, cue: null, startError: error });
    },

    restore({ journal: found, samples, state }) {
      if (get().phase !== 'idle' || !get().course) return;
      const fired = found.fired.map((f) => ({ ...f, silent: true }));
      set({ runId: found.runId, recovered: found, samples, state, fired, phase: 'recovered', cue: null, startError: null });
    },

    async resume(source) {
      const { recovered, pack, state, fired } = get();
      if (get().phase !== 'recovered' || !recovered) return;
      const mine = ++generation;
      const current = () => generation === mine;
      // The lines placed on the course that fell due while the phone was dark are not said late and
      // all at once; the finish would be. Never heard, they take no turn in their pool.
      const backlog = pack ? nextEvents(state, pack, new Set(fired.map((f) => f.key))).filter((f) => f.event.trigger.kind !== 'finish') : [];
      const missed = backlog.map((f) => ({ eventId: f.event.id, key: f.key, distanceM: state.distanceM, elapsedMs: state.elapsedMs, silent: true, missed: true }));
      set({ source, fired: [...fired, ...missed], recovered: null, startError: null });
      diag('run', `resumed ${recovered.runId} at ${Math.round(state.distanceM)} m, ${missed.length} lines missed`);
      void journal.adopt({ ...recovered, fired: get().fired });
      pause = NO_PAUSE;
      onState(tick(state, source.now()));
      const error = await listen(source, current);
      if (error === null || !current()) return;
      await journal.close();
      set({ phase: 'recovered', recovered, source: null, startError: error });
    },

    async stop() {
      const { source, state, phase } = get();
      if (timer) clearInterval(timer);
      timer = null;
      ceremony?.stop();
      ceremony = null;
      await source?.stop();
      if (phase === 'running' || phase === 'finished') await journal.stop(source?.now() ?? Date.now());
      if (state.phase === 'running') set({ state: abandonRun(state), phase: 'finished', recovered: null });
    },

    async forget() {
      await journal.close();
      await journalFiles.clear().catch(() => undefined);
    },

    reset() {
      generation += 1;
      // The journal stays on disk as it is: a run is only ever cleared once its upload is queued.
      void journal.close();
      // Not stop(): its tail would turn the run 'finished' after this, and a later screen would upload it.
      if (timer) clearInterval(timer);
      timer = null;
      ceremony?.stop();
      ceremony = null;
      pause = NO_PAUSE;
      void get().source?.stop().catch(() => undefined);
      const { course } = get();
      set({ state: idleRun(course?.distanceM ?? 0), phase: 'idle', runId: newRunId(), samples: [], fired: [], source: null, cue: null, recovered: null });
    },

    setVisible(next) {
      visible = next;
      const { phase, state, source } = get();
      if (next && phase === 'running' && source) set({ state: tick(state, source.now()) });
    },
  };
});
