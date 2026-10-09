import type { LocationSample } from '../schemas/run';
import { haversineM } from './geo';

/**
 * 1D constant-velocity Kalman filter on cumulative distance. State is [distance, speed].
 * Pure: every step returns a new state. Measurement noise comes from the GPS accuracy.
 */
export type KalmanState = {
  d: number;
  v: number;
  /** 2x2 covariance, row-major. */
  p: [number, number, number, number];
  t: number;
};

export type KalmanConfig = {
  /** Acceleration noise (m/s^2). Higher trusts the measurements more when speed changes. */
  accelNoise: number;
  /** Used when a sample has no accuracy. */
  defaultAccuracyM: number;
};

export const DEFAULT_KALMAN: KalmanConfig = { accelNoise: 0.5, defaultAccuracyM: 10 };

export const kalmanInit = (d: number, t: number, accuracyM: number, v = 0): KalmanState => ({
  d,
  v,
  p: [accuracyM * accuracyM, 0, 0, 4],
  t,
});

export const kalmanStep = (
  s: KalmanState,
  measuredD: number,
  t: number,
  accuracyM: number | undefined,
  config: KalmanConfig = DEFAULT_KALMAN,
): KalmanState => {
  const dt = Math.max(0.001, (t - s.t) / 1000);
  // Predict
  const dPred = s.d + s.v * dt;
  const q = config.accelNoise * config.accelNoise;
  const [p00, p01, p10, p11] = s.p;
  const pp00 = p00 + dt * (p10 + p01) + dt * dt * p11 + (q * dt ** 4) / 4;
  const pp01 = p01 + dt * p11 + (q * dt ** 3) / 2;
  const pp10 = p10 + dt * p11 + (q * dt ** 3) / 2;
  const pp11 = p11 + q * dt * dt;
  // Update with the measurement of d only
  const r = (accuracyM ?? config.defaultAccuracyM) ** 2;
  const sInnov = pp00 + r;
  const k0 = pp00 / sInnov;
  const k1 = pp10 / sInnov;
  const innovation = measuredD - dPred;
  return {
    d: dPred + k0 * innovation,
    v: s.v + k1 * innovation,
    p: [(1 - k0) * pp00, (1 - k0) * pp01, pp10 - k1 * pp00, pp11 - k1 * pp01],
    t,
  };
};

export type FilterConfig = {
  /** Reject fixes worse than this (meters). */
  maxAccuracyM: number;
  /** Reject implied speeds above this (m/s). 10 m/s is 36 km/h. */
  maxSpeedMps: number;
  /**
   * Wait until the runner moved at least this far from the last accepted fix. Position
   * noise adds to every step, so longer steps are more honest. 8 m is 2-3 s of running.
   */
  minMovementM: number;
  /**
   * The wait grows with the fix's own accuracy: a step must be this many times the accuracy
   * before it counts, so a vaguer fix waits for a longer step. 3 m accuracy keeps the 8 m floor.
   */
  minMovementAccuracyFactor: number;
  /**
   * A step is capped at this multiple of the distance the receiver's reported speed allows,
   * which removes a standing phone's drift and a jump. A loose ceiling on purpose: the first
   * real run (Galaxy S23) reported speeds 8-16 % under a watch, and the old +-15 % clamp cost
   * it 1.9 % of its distance (docs/MEMORY.md, 2026-09-27).
   */
  dopplerCeilingFactor: number;
  /**
   * When the fixes stall while the phone says it kept moving (a hairpin, a frozen fix), the
   * step is lifted to the reported-speed distance divided by this factor. Positions alone cut
   * a U-turn short. Only then: a floor on every step inflates a noisy trace.
   */
  dopplerFloorFactor: number;
  /** A stall is a step short of that floor by more than this many times the fix's accuracy. */
  stallAccuracyFactor: number;
  /**
   * Only a short step can stall (a U-turn takes about 7 s). Across a longer one the runner may
   * have stood still (a red light, a water station, the jitter in between rejected): the two
   * running speeds at either end say nothing about it, and the straight line is all we know.
   */
  maxStallS: number;
};

export const DEFAULT_FILTER: FilterConfig = {
  maxAccuracyM: 30,
  maxSpeedMps: 10,
  minMovementM: 8,
  minMovementAccuracyFactor: 3,
  dopplerCeilingFactor: 1.5,
  dopplerFloorFactor: 1.15,
  stallAccuracyFactor: 2,
  maxStallS: 10,
};

export type FilterVerdict = { ok: true; stepM: number } | { ok: false; reason: 'accuracy' | 'time' | 'speed' | 'jitter' };

/** The least ground a fix must cover to count: a few times its own accuracy, never under `minMovementM`. */
export const minStepM = (accuracy: number | undefined, config: FilterConfig = DEFAULT_FILTER): number =>
  Math.max(config.minMovementM, (accuracy ?? 0) * config.minMovementAccuracyFactor);

/** Decides whether a new fix contributes distance, and how much. */
export const judgeSample = (
  prev: LocationSample | undefined,
  next: LocationSample,
  config: FilterConfig = DEFAULT_FILTER,
): FilterVerdict => {
  if (next.accuracy !== undefined && next.accuracy > config.maxAccuracyM) return { ok: false, reason: 'accuracy' };
  if (!prev) return { ok: true, stepM: 0 };
  const dtS = (next.timestamp - prev.timestamp) / 1000;
  if (dtS <= 0) return { ok: false, reason: 'time' };
  const positionStepM = haversineM(prev, next);
  if (positionStepM / dtS > config.maxSpeedMps) return { ok: false, reason: 'speed' };
  if (positionStepM < minStepM(next.accuracy, config)) return { ok: false, reason: 'jitter' };
  const dopplerStepM =
    prev.speed !== undefined && next.speed !== undefined ? ((prev.speed + next.speed) / 2) * dtS : undefined;
  if (dopplerStepM === undefined) return { ok: true, stepM: positionStepM };
  const floorM = dopplerStepM / config.dopplerFloorFactor;
  const stalled = dtS <= config.maxStallS && next.accuracy !== undefined && floorM - positionStepM > config.stallAccuracyFactor * next.accuracy;
  return { ok: true, stepM: stalled ? floorM : Math.min(positionStepM, dopplerStepM * config.dopplerCeilingFactor) };
};
