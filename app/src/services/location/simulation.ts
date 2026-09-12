import type { LocationSample } from '@sivoov/shared';
import { constantPace, simulateSamples } from '@sivoov/shared';
import type { CourseTrack, PaceProfile } from '@sivoov/shared';
import type { LocationSource } from './types';

export type SimulationConfig = {
  track: CourseTrack;
  targetM: number;
  pace?: PaceProfile;
  /** Real-time multiplier: 20 means a 50-minute run plays in 2.5 minutes. */
  speedFactor?: number;
  intervalMs?: number;
  noiseM?: number;
  seed?: number;
};

/** Plays the shared simulator through the LocationSource interface, with time acceleration. */
export const simulationSource = (config: SimulationConfig): LocationSource => {
  const speedFactor = config.speedFactor ?? 1;
  const intervalMs = config.intervalMs ?? 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // One clock for the whole life of the source: the countdown and the gun use it too.
  // Once fixes flow, the clock follows them: browser timers drift at high speed factors and a
  // wall-based clock would run ahead of the samples and inflate the elapsed time.
  const realStart = Date.now();
  let last: { t: number; wall: number } | null = null;
  const now = () =>
    last ? Math.min(last.t + intervalMs, last.t + (Date.now() - last.wall) * speedFactor) : realStart + (Date.now() - realStart) * speedFactor;
  return {
    kind: 'simulation',
    now,
    async start(onSample) {
      const gen = simulateSamples({
        track: config.track,
        targetM: config.targetM,
        pace: config.pace ?? constantPace(330),
        startTime: now(),
        intervalMs,
        noiseM: config.noiseM ?? 4,
        seed: config.seed ?? 1,
      });
      const step = () => {
        const next = gen.next();
        if (next.done) return;
        const sample: LocationSample = next.value;
        last = { t: sample.timestamp, wall: Date.now() };
        onSample(sample);
        timer = setTimeout(step, intervalMs / speedFactor);
      };
      step();
    },
    async stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
};
