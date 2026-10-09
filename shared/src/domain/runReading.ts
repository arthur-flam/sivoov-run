import type { AudioEvent, TakeWhen } from '../schemas/audio';
import type { RunState } from './tracker';

/**
 * What the run says about the runner, read from the run and never asked (PRODUCTION.md, "What
 * the engine needs"): their own rhythm over the first two kilometres, how the last one
 * compares, a round finish time within reach, and whether they are running again after a stop.
 * The engine picks takes by it (`pickTake`) and live lines say it (`liveFactsFor`).
 */

/** Slower than this is walking or standing: 10:00/km. */
export const WALKING_PACE_S = 600;
/** The tracker counts ground in steps of 8 m or more: this long without one, the runner is standing. */
const STILL_AFTER_MS = 12_000;
/** The runner's speed is read over about this much of their latest ground. */
const RECENT_MS = 8_000;
/** A stop or a walk at least this long earns a word when the runner runs again. */
export const PAUSE_WORTH_MS = 20_000;
/** How long after running again `restart` holds. */
const RESTART_FOR_MS = 20_000;
/** The last kilometre within this share of the opening pace is `steady`. */
const STEADY_SHARE = 0.025;
/** A round finish time is a whole number of these. */
const ROUND_S = 300;

type Moving = Pick<RunState, 'phase' | 'distanceM' | 'elapsedMs' | 'window'>;
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

/** Walking or standing, now. Never in the first 100 m: the start is everyone's slow. */
export const isSlow = (state: Moving): boolean => {
  if (state.phase !== 'running' || state.distanceM < 100) return false;
  const lastStep = state.window[state.window.length - 1]?.elapsedMs ?? 0;
  if (state.elapsedMs - lastStep > STILL_AFTER_MS) return true;
  const speed = recentSpeed(state.window);
  return speed !== null && speed < 1000 / WALKING_PACE_S;
};

/** The pause record after this tick: a stop starts, goes on, or ends (and is remembered). */
export const followPause = (pause: Pause, state: Moving): Pause => {
  if (isSlow(state)) {
    if (pause.slowSinceMs !== null) return pause;
    // Standing still is only seen a while after the last step: it began there. A walk, now.
    const lastStep = state.window[state.window.length - 1]?.elapsedMs ?? state.elapsedMs;
    return { ...pause, slowSinceMs: state.elapsedMs - lastStep > STILL_AFTER_MS ? lastStep : state.elapsedMs };
  }
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
  const reach = Math.max(15, 0.04 * (projectedS - state.elapsedMs / 1000));
  return target > 0 && Math.abs(projectedS - target) <= reach ? target : null;
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
  const candidates = [{ id: undefined as string | undefined, when: undefined as TakeWhen | undefined }, ...(event.takes ?? [])]
    .map((c, i) => ({ ...c, i, times: heard.filter((h) => h === c.id).length }))
    .filter((c) => (only ? c.when === only : !c.when || holds(c.when, reading)))
    .sort((a, b) => Number(a.times > 0) - Number(b.times > 0) || Number(!a.when) - Number(!b.when) || a.times - b.times || a.i - b.i);
  return candidates[0]?.id;
};
