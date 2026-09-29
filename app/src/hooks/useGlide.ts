import { useEffect, useRef, useState } from 'react';
import { glideStep, speedFromPace } from '@sivoov/shared';
import type { RunState } from '@sivoov/shared';
import { GLIDE_MS } from '@/components/run/mapConfig';

/**
 * The runner's distance for the map, frame by frame while `running` (`glideStep`): on at the
 * runner's pace, closing gently on the tracker, whose distance moves in steps. `rate`: how fast
 * the run's clock goes against the phone's (a simulation plays five times faster than life).
 * Moves every GLIDE_MS. Otherwise the tracker's own, and no speed.
 */
export const useGlide = (state: Pick<RunState, 'distanceM' | 'paceSecPerKm' | 'targetM'>, running: boolean, rate = 1): { m: number; speedMps: number } => {
  const [shown, setShown] = useState(state.distanceM);
  const latest = useRef(state);
  latest.current = state;
  // When the tracker's distance last moved on, on the phone's clock.
  const stepped = useRef({ m: state.distanceM, at: Date.now() });
  if (state.distanceM !== stepped.current.m) stepped.current = { m: state.distanceM, at: Date.now() };

  useEffect(() => {
    if (!running) return setShown(latest.current.distanceM);
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const { distanceM, paceSecPerKm, targetM } = latest.current;
      setShown((prev) => glideStep({ fixM: distanceM, sinceFixMs: now - stepped.current.at, speedMps: speedFromPace(paceSecPerKm) * rate, shownM: prev, dtMs: now - last, targetM }));
      last = now;
    }, GLIDE_MS);
    return () => clearInterval(id);
  }, [running, rate]);

  // Back on screen, the first frame comes before the glide's first step: a map left far behind in
  // the background goes straight to the runner then (glideStep's snap), not a frame later.
  const m = glideStep({ fixM: state.distanceM, sinceFixMs: 0, speedMps: 0, shownM: shown, dtMs: 0, targetM: state.targetM });
  return running ? { m, speedMps: speedFromPace(state.paceSecPerKm) * rate } : { m: state.distanceM, speedMps: 0 };
};
