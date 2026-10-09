import type { AudioEvent, TakeWhen } from '../schemas/audio';
import { minStepM } from './smoothing';
import type { RunState } from './tracker';

/**
 * What the run says about the runner, read from the run and never asked (PRODUCTION.md, "What
 * the engine needs"): their own rhythm over the first two kilometres, how the last one
 * compares, a round finish time within reach, and whether they are running again after a stop.
 * The engine picks takes by it (`pickTake`) and live lines say it (`liveFactsFor`).
 */

/** Slower than this is walking or standing: 10:00/km. */
const WALKING_PACE_S = 600;
/** The runner's speed is read over about this much of their latest ground. */
const RECENT_MS = 8_000;
/** A stop or a walk at least this long earns a word when the runner runs again. */
const PAUSE_WORTH_MS = 20_000;
/** How long after running again `restart` holds. */
const RESTART_FOR_MS = 20_000;
/** The last kilometre within this share of the opening pace is `steady`. */
const STEADY_SHARE = 0.025;
/** A round finish time is a whole number of these. */
const ROUND_S = 300;

type Moving = Pick<RunState, 'phase' | 'distanceM' | 'elapsedMs' | 'window' | 'lastSample'>;
type Run = Pick<RunState, 'phase' | 'distanceM' | 'elapsedMs' | 'targetM' | 'splits'>;

/** The runner's stops and walks, followed from tick to tick (`followPause`). */
export type Pause = { slowSinceMs: number | null; last: { endedMs: number; lastedMs: number } | null };
export const NO_PAUSE: Pause = { slowSinceMs: null, last: null };

/** Speed over the runner's latest ground, m/s; null with fewer than two counted steps. */
const recentSpeed = (window: Moving['window']): number | null => {
  const last = window[window.length - 1];
  if (!last) return null;
  const from = [...window].reverse().find((w) => last.elapsedMs - w.elapsedMs >= RECENT_MS) ?? window[0]!;
  const dt = (last.elapsedMs - from.elapsedMs) / 1000;
  return dt > 0 ? (last.distanceM - from.distanceM) / dt : null;
};

/**
 * Since when the runner has been walking or standing, null while they run. `lastSample` is the
 * latest fix (the app hands it over, accepted or not): its own Doppler speed says it when the
 * phone gives one. Without it: the tracker counts ground only in steps of `minStepM` (more with a
 * poor fix), so a runner is standing once a walker would have made a step and none came, and the
 * stop began at the last step; a walk shows in the latest ground's speed, and dates from now.
 * Never in the first 100 m: the start is everyone's slow.
 */
const slowSinceMs = (state: Moving): number | null => {
  if (state.phase !== 'running' || state.distanceM < 100) return null;
  const walking = 1000 / WALKING_PACE_S;
  const lastStep = state.window[state.window.length - 1]?.elapsedMs ?? 0;
  const still = state.elapsedMs - lastStep > Math.max(12_000, minStepM(state.lastSample?.accuracy) * WALKING_PACE_S);
  const reported = state.lastSample?.speed;
  if (reported !== undefined) return reported >= walking ? null : still ? lastStep : state.elapsedMs;
  if (still) return lastStep;
  const ground = recentSpeed(state.window);
  return ground !== null && ground < walking ? state.elapsedMs : null;
};

/** Walking or standing, now. */
export const isSlow = (state: Moving): boolean => slowSinceMs(state) !== null;

/** The pause record after this tick: a stop starts, goes on, or ends (and is remembered). */
export const followPause = (pause: Pause, state: Moving): Pause => {
  const since = slowSinceMs(state);
  if (since !== null) return pause.slowSinceMs === null ? { ...pause, slowSinceMs: since } : pause;
  if (pause.slowSinceMs === null) return pause;
  return { slowSinceMs: null, last: { endedMs: state.elapsedMs, lastedMs: state.elapsedMs - pause.slowSinceMs } };
};

export type RunReading = {
  /** The runner's own pace over km 1-2, s/km: their rhythm, measured. Null before km 2. */
  refPaceS: number | null;
  /** The last full kilometre against that rhythm. Null before km 3. */
  drift: 'steady' | 'faster' | 'slower' | null;
  /** The finish time at the average pace so far. Null in the first kilometre. */
  projectedS: number | null;
  /** A round finish time (whole five minutes) the projection is close to. */
  targetS: number | null;
  /** Their fastest kilometre so far. */
  best: { km: number; seconds: number } | null;
  /** Running again after at least 20 s stopped or walking, for the next 20 s. */
  restart: boolean;
};

const roundTarget = (state: Run, projectedS: number | null): number | null => {
  const leftM = state.targetM - state.distanceM;
  if (projectedS === null || state.distanceM < state.targetM * 0.3 || leftM < 1000) return null;
  const target = Math.round(projectedS / ROUND_S) * ROUND_S;
  // Within reach: 4 % of the time left, at least 15 s, at most a minute (else every marathon projection is near a round time).
  const reach = Math.min(60, Math.max(15, 0.04 * (projectedS - state.elapsedMs / 1000)));
  return Math.abs(projectedS - target) <= reach ? target : null;
};

export const readRun = (state: Run, pause: Pause = NO_PAUSE): RunReading => {
  const { splits } = state;
  const refPaceS = splits.length >= 2 ? splits[1]!.elapsedMs / 2000 : null;
  const lastS = splits.length >= 3 ? splits[splits.length - 1]!.splitMs / 1000 : null;
  const drift =
    refPaceS === null || lastS === null ? null : Math.abs(lastS / refPaceS - 1) <= STEADY_SHARE ? 'steady' : lastS < refPaceS ? 'faster' : 'slower';
  const projectedS = state.phase === 'running' && state.distanceM >= 1000 ? (state.elapsedMs / 1000) * (state.targetM / state.distanceM) : null;
  const best = splits.reduce<RunReading['best']>((b, s) => (b === null || s.splitMs / 1000 < b.seconds ? { km: s.km, seconds: s.splitMs / 1000 } : b), null);
  const last = pause.last;
  const restart = last !== null && last.lastedMs >= PAUSE_WORTH_MS && state.elapsedMs - last.endedMs <= RESTART_FOR_MS;
  return { refPaceS, drift, projectedS, targetS: roundTarget(state, projectedS), best, restart };
};

/** Whether a take written for `when` fits the run now. */
export const holds = (when: TakeWhen, reading: RunReading): boolean => {
  switch (when) {
    case 'steady':
    case 'faster':
    case 'slower':
      return reading.drift === when;
    case 'round':
      return reading.targetS !== null;
    case 'restart':
      return reading.restart;
  }
};

/**
 * Which take of a line to say: one the runner has not heard in this run, one written for this
 * moment of the run (its condition holds) before a general one, then the least heard, then the
 * script's order. The line's own words are the take with no id and no condition. `only`: the
 * director wants a take for that moment and nothing else (a restart word).
 * `heard`: the takes already said for this line in this run, in order.
 */
export const pickTake = (event: Pick<AudioEvent, 'takes'>, reading: RunReading, heard: (string | undefined)[], only?: TakeWhen): string | undefined => {
  const own: { id?: string; when?: TakeWhen } = {};
  const candidates = [own, ...(event.takes ?? [])]
    .map((c, i) => ({ id: c.id, when: c.when, i, times: heard.filter((h) => h === c.id).length }))
    .filter((c) => (only ? c.when === only : !c.when || holds(c.when, reading)));
  const best = [...candidates].sort(
    (a, b) =>
      Number(a.times > 0) - Number(b.times > 0) || // not heard in this run first
      Number(!a.when) - Number(!b.when) || // then a take written for this moment
      a.times - b.times || // then the least heard
      a.i - b.i, // then the script's order
  )[0];
  return best?.id;
};
