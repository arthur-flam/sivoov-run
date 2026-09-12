import type { LocationSample } from '../schemas/run';
import type { CourseTrack } from './course';
import { positionAtDistance } from './course';
import { destination } from './geo';

/** Deterministic PRNG (mulberry32) so simulated runs are reproducible in tests. */
export const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const gaussian = (rand: () => number): number => {
  const u = Math.max(1e-12, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export type PaceProfile = (runM: number) => number; // seconds per km at that distance

export const constantPace = (secPerKm: number): PaceProfile => () => secPerKm;

/** Positive split: starts at `startSecPerKm`, drifts linearly to `endSecPerKm` at `overM`. */
export const fadingPace =
  (startSecPerKm: number, endSecPerKm: number, overM: number): PaceProfile =>
  (runM) =>
    startSecPerKm + (endSecPerKm - startSecPerKm) * Math.min(1, runM / overM);

export type SimulationOptions = {
  track: CourseTrack;
  /** Official distance to run; the simulated runner stops there. */
  targetM: number;
  pace: PaceProfile;
  /** Wall-clock start, epoch ms. */
  startTime: number;
  intervalMs?: number;
  /** Std deviation of the GPS noise, meters. 0 for a perfect trace. */
  noiseM?: number;
  seed?: number;
};

/**
 * Generates GPS fixes along the course as if a runner were running it at the given pace,
 * at real ground speed, from the start line. Lazy: the app pulls one fix per interval;
 * tests collect them all. A run shorter than the course covers its first kilometers.
 */
export function* simulateSamples(opts: SimulationOptions): Generator<LocationSample, void, void> {
  const intervalMs = opts.intervalMs ?? 1000;
  const noiseM = opts.noiseM ?? 0;
  const rand = seededRandom(opts.seed ?? 1);
  if (opts.targetM > opts.track.totalM + 1) throw new Error('the simulated distance is longer than the course');
  // Receiver error is autocorrelated: a slowly wandering offset, not white noise per fix.
  // AR(1) with this correlation per second has a time constant of about 50 s.
  const rho = Math.pow(0.98, intervalMs / 1000);
  const innovation = noiseM * Math.sqrt(1 - rho * rho);
  let offset = { x: gaussian(rand) * noiseM, y: gaussian(rand) * noiseM };
  let runM = 0;
  let t = opts.startTime;
  while (true) {
    const { point } = positionAtDistance(opts.track, runM);
    offset = { x: rho * offset.x + gaussian(rand) * innovation, y: rho * offset.y + gaussian(rand) * innovation };
    const noisy = noiseM > 0 ? destination(destination(point, 90, offset.x), 0, offset.y) : point;
    const accuracy = noiseM > 0 ? Math.max(3, noiseM * (1 + 0.3 * gaussian(rand))) : 3;
    const speed = 1000 / opts.pace(runM);
    // Doppler speed is good to a few tenths of a m/s on a phone; scale its error with the noise.
    const reportedSpeed = noiseM > 0 ? Math.max(0, speed + gaussian(rand) * 0.04 * noiseM) : speed;
    yield { lat: noisy.lat, lng: noisy.lng, accuracy, speed: reportedSpeed, timestamp: t, altitude: 0 };
    if (runM >= opts.targetM) return;
    runM = Math.min(opts.targetM, runM + speed * (intervalMs / 1000));
    t += intervalMs;
  }
}

export const simulateRun = (opts: SimulationOptions): LocationSample[] => [...simulateSamples(opts)];
