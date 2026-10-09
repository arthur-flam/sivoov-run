import type { AudioPack, LiveFacts } from '../schemas/audio';
import type { LocationSample } from '../schemas/run';
import { afterPause } from './audioTriggers';
import type { CourseTrack } from './course';
import { positionAtDistance } from './course';
import { destination } from './geo';
import { liveFactsFor } from './placeholders';
import { dueLines } from './rhythm';
import type { Said } from './rhythm';
import { NO_PAUSE, followPause } from './runReading';
import { takeOf } from './takes';
import { applySample, bridgedGap, idleRun, startRun, tick } from './tracker';

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
  /**
   * Reported speed as a fraction of the true one. 1 by default; the first real phone (Galaxy
   * S23) reported 0.84 to 0.92 of what a watch measured on the same run.
   */
  speedScale?: number;
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
    // Reported speed: a few tenths of a m/s of noise, scaled with the GPS noise, and possibly biased.
    const scaled = speed * (opts.speedScale ?? 1);
    const reportedSpeed = noiseM > 0 ? Math.max(0, scaled + gaussian(rand) * 0.04 * noiseM) : scaled;
    yield { lat: noisy.lat, lng: noisy.lng, accuracy, speed: reportedSpeed, timestamp: t, altitude: 0 };
    if (runM >= opts.targetM) return;
    runM = Math.min(opts.targetM, runM + speed * (intervalMs / 1000));
    t += intervalMs;
  }
}

export const simulateRun = (opts: SimulationOptions): LocationSample[] => [...simulateSamples(opts)];

/* ---------- a run heard on paper ---------- */

/** How a simulated runner runs: an even pace, stops and walks along the way, a fix's accuracy, the screen on or off. */
export type RunPlan = {
  paceSecPerKm: number;
  stops?: { atM: number; seconds: number }[];
  walks?: { atM: number; seconds: number; paceSecPerKm?: number }[];
  /** Metres; 5 by default (a good fix). */
  accuracyM?: number;
  /** Off: no clock ticks between fixes, as with the phone in a pocket. On by default. */
  screen?: 'on' | 'off';
};

/** One line of a simulated run: when (from the gun), where, how long it sounds, and what the run knew (a live line's numbers). */
export type Heard = Said & { distanceM: number; file?: string; seconds: number; under?: string; facts: LiveFacts };

/** A walker's pace when the plan does not say: 11:00/km. */
const WALK_PACE_S = 660;
/** Metres of latitude in a degree: the simulated runner runs north along a meridian. */
const M_PER_DEGREE = 111_195;

/** Where the plan has the runner at each second: the speed now, stops and walks counted from where they start. */
const speedsOf = (plan: RunPlan) => {
  const pending = [...(plan.stops ?? []).map((s) => ({ ...s, pace: Infinity })), ...(plan.walks ?? []).map((w) => ({ ...w, pace: w.paceSecPerKm ?? WALK_PACE_S }))].sort(
    (a, b) => a.atM - b.atM,
  );
  let current: { until: number; pace: number } | null = null;
  return (t: number, m: number): number => {
    if (current && t > current.until) current = null;
    if (!current && pending[0] && m >= pending[0].atM) {
      const next = pending.shift()!;
      current = { until: t + next.seconds, pace: next.pace };
    }
    return 1000 / (current?.pace ?? plan.paceSecPerKm);
  };
};

/**
 * Pure: the lines a runner holding `plan` hears, as the app says them: a fix a second through the
 * real tracker (`applySample`), the clock ticked between fixes while the screen is on, the pause
 * followed and `dueLines` asked at every fix, a backlog after a long gap dropped (`afterPause`) and
 * kept as missed. For the density check in tests and the full runs of `npm run produce`.
 */
export const hearRun = (pack: Pick<AudioPack, 'events' | 'files' | 'maxGapS'>, targetM: number, plan: RunPlan): Heard[] => {
  const speedAt = speedsOf(plan);
  const accuracy = plan.accuracyM ?? 5;
  let state = startRun(idleRun(targetM), 0);
  let pause = NO_PAUSE;
  let m = 0;
  const heard: Heard[] = [];
  for (let t = 1; t <= 6 * 3600 && state.phase === 'running'; t += 1) {
    const speed = speedAt(t, m);
    m += speed;
    const at = t * 1000;
    const before = plan.screen === 'off' ? state : tick(state, at);
    const fix = { lat: m / M_PER_DEGREE, lng: 0, accuracy, speed, timestamp: at };
    const next = applySample(before, fix);
    // The engine's view, as the app's run store makes it: the fix's time and the fix itself.
    const now = { ...tick(next, at), lastSample: fix };
    state = next;
    pause = followPause(pause, now);
    const due = dueLines(now, pack, heard, pause);
    const kept = (bridgedGap(before, next) ? afterPause(due) : due).filter((d) => !d.quiet);
    due.forEach((d) => {
      const file = takeOf(d.event, d.take)?.key;
      heard.push({
        eventId: d.event.id,
        key: d.key,
        ...(d.take ? { take: d.take } : {}),
        elapsedMs: now.elapsedMs,
        distanceM: now.distanceM,
        ...(kept.includes(d) ? {} : { missed: true }),
        ...(file ? { file } : {}),
        seconds: kept.includes(d) ? (pack.files[file ?? '']?.seconds ?? 0) : 0,
        ...(d.event.under ? { under: d.event.under } : {}),
        facts: liveFactsFor(now),
      });
    });
  }
  return heard;
};
