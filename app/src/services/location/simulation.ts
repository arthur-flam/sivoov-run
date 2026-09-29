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

/** How often the simulation looks at its clock and hands over the fixes that fell due. */
const TICK_MS = 250;

/**
 * Plays the shared simulator through the LocationSource interface, with time acceleration.
 * The simulation's clock is the phone's, sped up: it runs evenly from the moment the source is
 * made (the countdown and the gun use it too), whatever the timers do. Fixes come one a second
 * of that clock, as on a phone; each tick hands over those that fell due, several at once at
 * high speed or when a tick comes late, so a busy phone never slows the run down.
 */
export const simulationSource = (config: SimulationConfig): LocationSource => {
  const speedFactor = config.speedFactor ?? 1;
  const intervalMs = config.intervalMs ?? 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const realStart = Date.now();
  const now = () => realStart + (Date.now() - realStart) * speedFactor;
  return {
    kind: 'simulation',
    now,
    rate: speedFactor,
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
      let next = gen.next();
      const step = () => {
        const due = now();
        while (!next.done && next.value.timestamp <= due) {
          const sample: LocationSample = next.value;
          next = gen.next();
          onSample(sample);
        }
        timer = next.done ? null : setTimeout(step, Math.min(TICK_MS, intervalMs / speedFactor));
      };
      step();
    },
    async stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
};
