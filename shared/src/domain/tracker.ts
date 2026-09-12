import type { LocationSample, Split } from '../schemas/run';
import { DEFAULT_FILTER, DEFAULT_KALMAN, judgeSample, kalmanInit, kalmanStep } from './smoothing';
import type { FilterConfig, KalmanConfig, KalmanState } from './smoothing';

/**
 * The run reducer. Real distance run, from GPS, drives everything: virtual position,
 * splits, audio. Pure: (state, sample) -> state. The run screen only renders this.
 */
export type RunPhase = 'idle' | 'running' | 'finished';

export type RunState = {
  phase: RunPhase;
  /** Official distance to cover, meters. */
  targetM: number;
  startedAt: number | null;
  /** Elapsed at the last update, frozen at the finish. */
  elapsedMs: number;
  /** Smoothed distance, the one shown and used everywhere. */
  distanceM: number;
  /** Sum of accepted GPS steps, before smoothing. For the trace. */
  rawDistanceM: number;
  splits: Split[];
  /** Pace over the recent window, seconds per km. Null until enough distance. */
  paceSecPerKm: number | null;
  /** Average pace since the start. */
  avgPaceSecPerKm: number | null;
  lastSample: LocationSample | null;
  kalman: KalmanState | null;
  /** Recent (elapsedMs, distanceM) points for the pace window. */
  window: Array<{ elapsedMs: number; distanceM: number }>;
  accepted: number;
  rejected: number;
};

export type TrackerConfig = {
  filter: FilterConfig;
  kalman: KalmanConfig;
  /** Pace window, milliseconds. */
  paceWindowMs: number;
  splitEveryM: number;
};

export const DEFAULT_TRACKER: TrackerConfig = {
  filter: DEFAULT_FILTER,
  kalman: DEFAULT_KALMAN,
  paceWindowMs: 30_000,
  splitEveryM: 1000,
};

export const idleRun = (targetM: number): RunState => ({
  phase: 'idle',
  targetM,
  startedAt: null,
  elapsedMs: 0,
  distanceM: 0,
  rawDistanceM: 0,
  splits: [],
  paceSecPerKm: null,
  avgPaceSecPerKm: null,
  lastSample: null,
  kalman: null,
  window: [],
  accepted: 0,
  rejected: 0,
});

/** The gun. Distance starts counting from the first fix after this instant. */
export const startRun = (state: RunState, now: number): RunState =>
  state.phase === 'idle' ? { ...state, phase: 'running', startedAt: now, elapsedMs: 0 } : state;

/** Elapsed time at which `atM` was crossed, interpolated between two points. */
const crossingTime = (
  from: { elapsedMs: number; distanceM: number },
  to: { elapsedMs: number; distanceM: number },
  atM: number,
): number => {
  const span = to.distanceM - from.distanceM;
  const t = span > 0 ? (atM - from.distanceM) / span : 1;
  return Math.round(from.elapsedMs + (to.elapsedMs - from.elapsedMs) * Math.max(0, Math.min(1, t)));
};

const newSplits = (
  prev: RunState,
  next: { elapsedMs: number; distanceM: number },
  everyM: number,
): Split[] => {
  const from = { elapsedMs: prev.elapsedMs, distanceM: prev.distanceM };
  const firstKm = prev.splits.length + 1;
  const lastKm = Math.floor(Math.min(next.distanceM, prev.targetM) / everyM);
  return Array.from({ length: Math.max(0, lastKm - firstKm + 1) }, (_, i) => firstKm + i).reduce<Split[]>(
    (acc, km) => {
      const elapsedMs = crossingTime(from, next, km * everyM);
      const prevElapsed = acc.length > 0 ? acc[acc.length - 1]!.elapsedMs : (prev.splits[prev.splits.length - 1]?.elapsedMs ?? 0);
      return [...acc, { km, elapsedMs, splitMs: elapsedMs - prevElapsed }];
    },
    [],
  );
};

const paceOver = (window: RunState['window']): number | null => {
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return null;
  const dM = last.distanceM - first.distanceM;
  const dMs = last.elapsedMs - first.elapsedMs;
  return dM >= 20 && dMs > 0 ? dMs / dM : null;
};

/** Feed one GPS fix. Ignored unless the run is in progress. */
export const applySample = (state: RunState, sample: LocationSample, config: TrackerConfig = DEFAULT_TRACKER): RunState => {
  if (state.phase !== 'running' || state.startedAt === null) return state;
  const verdict = judgeSample(state.lastSample ?? undefined, sample, config.filter);
  if (!verdict.ok) return { ...state, rejected: state.rejected + 1 };

  const rawDistanceM = state.rawDistanceM + verdict.stepM;
  const kalman =
    state.kalman === null
      ? kalmanInit(rawDistanceM, sample.timestamp, sample.accuracy ?? config.kalman.defaultAccuracyM, sample.speed ?? 0)
      : kalmanStep(state.kalman, rawDistanceM, sample.timestamp, sample.accuracy, config.kalman);
  // Distance never goes backwards and never outruns the raw sum by more than the accuracy.
  const distanceM = Math.max(state.distanceM, Math.min(kalman.d, rawDistanceM));
  const elapsedMs = Math.max(state.elapsedMs, sample.timestamp - state.startedAt);
  const next = { elapsedMs, distanceM };
  const splits = [...state.splits, ...newSplits(state, next, config.splitEveryM)];
  const window = [...state.window, next].filter((w) => elapsedMs - w.elapsedMs <= config.paceWindowMs);
  const finished = distanceM >= state.targetM;
  const finalElapsed = finished ? crossingTime({ elapsedMs: state.elapsedMs, distanceM: state.distanceM }, next, state.targetM) : elapsedMs;
  const finalDistance = finished ? state.targetM : distanceM;

  return {
    ...state,
    phase: finished ? 'finished' : 'running',
    elapsedMs: finalElapsed,
    distanceM: finalDistance,
    rawDistanceM,
    splits,
    paceSecPerKm: paceOver(window),
    avgPaceSecPerKm: finalDistance >= 100 ? finalElapsed / finalDistance : null,
    lastSample: sample,
    kalman,
    window,
    accepted: state.accepted + 1,
  };
};

/** Clock tick without a fix: keeps elapsed time moving on the screen. */
export const tick = (state: RunState, now: number): RunState =>
  state.phase === 'running' && state.startedAt !== null ? { ...state, elapsedMs: Math.max(state.elapsedMs, now - state.startedAt) } : state;

export const abandon = (state: RunState): RunState => ({ ...state, phase: 'finished' });

export const progress = (state: RunState): number => (state.targetM > 0 ? Math.min(1, state.distanceM / state.targetM) : 0);
