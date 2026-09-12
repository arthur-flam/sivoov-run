import type { LocationSample } from '@sivoov/shared';

/**
 * Where fixes come from. The run screen and the run store never know which one they have
 * (docs/MEMORY.md). `now()` is the source's clock: simulation can run faster than real time.
 */
export interface LocationSource {
  readonly kind: 'device' | 'simulation' | 'replay';
  start(onSample: (sample: LocationSample) => void): Promise<void>;
  stop(): Promise<void>;
  now(): number;
}
