import { useEffect, useRef, useState } from 'react';
import { glideStep, speedFromPace } from '@sivoov/shared';
import type { RunState } from '@sivoov/shared';
import { glideMsFor } from '@/components/run/mapConfig';

/**
 * The runner's distance for the map, frame by frame while `running` (`glideStep`): on at the
 * runner's pace, closing gently on the tracker, whose distance moves in steps. `rate`: how fast
 * the run's clock goes against the phone's (a simulation plays five times faster than life).
 * Moves every `glideMsFor(rate)`. Otherwise the tracker's own.
 */
export const useGlide = (state: Pick<RunState, 'distanceM' | 'paceSecPerKm' | 'targetM'>, running: boolean, rate = 1): number => {
  const [shown, setShown] = useState(state.distanceM);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    if (!running) return setShown(latest.current.distanceM);
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const { distanceM, paceSecPerKm, targetM } = latest.current;
      setShown((prev) => glideStep({ fixM: distanceM, speedMps: speedFromPace(paceSecPerKm) * rate, shownM: prev, dtMs: now - last, targetM }));
      last = now;
    }, glideMsFor(rate));
    return () => clearInterval(id);
  }, [running, rate]);

  return running ? shown : state.distanceM;
};
