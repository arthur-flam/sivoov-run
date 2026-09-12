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
   * Doppler speed from the receiver is far less noisy than positions. When both fixes carry
   * one, the step is kept within this factor of the speed-implied distance, both ways.
   */
  speedBoundFactor: number;
};

export const DEFAULT_FILTER: FilterConfig = { maxAccuracyM: 30, maxSpeedMps: 10, minMovementM: 8, speedBoundFactor: 1.15 };

export type FilterVerdict = { ok: true; stepM: number } | { ok: false; reason: 'accuracy' | 'time' | 'speed' | 'jitter' };

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
  if (positionStepM < config.minMovementM) return { ok: false, reason: 'jitter' };
  const dopplerStepM =
    prev.speed !== undefined && next.speed !== undefined ? ((prev.speed + next.speed) / 2) * dtS : undefined;
  const stepM =
    dopplerStepM === undefined
      ? positionStepM
      : Math.max(dopplerStepM / config.speedBoundFactor, Math.min(positionStepM, dopplerStepM * config.speedBoundFactor));
  return { ok: true, stepM };
};
