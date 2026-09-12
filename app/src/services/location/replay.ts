import type { LocationSample } from '@sivoov/shared';
import type { LocationSource } from './types';

/** Replays a recorded trace (from R2) at real speed or faster. For regressions from the road. */
export const replaySource = (samples: LocationSample[], speedFactor = 1): LocationSource => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const first = samples[0]?.timestamp ?? Date.now();
  let realStart = Date.now();
  return {
    kind: 'replay',
    now: () => first + (Date.now() - realStart) * speedFactor,
    async start(onSample) {
      realStart = Date.now();
      const step = (i: number) => {
        const s = samples[i];
        if (!s) return;
        onSample(s);
        const next = samples[i + 1];
        if (next) timer = setTimeout(() => step(i + 1), Math.max(0, (next.timestamp - s.timestamp) / speedFactor));
      };
      step(0);
    },
    async stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
};
