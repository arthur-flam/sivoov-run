import { useEffect, useRef, useState } from 'react';
import { glideDistance, speedFromPace } from '@sivoov/shared';
import type { RunState } from '@sivoov/shared';
import { GLIDE_MS } from '@/components/run/mapConfig';

/**
 * The runner's distance for the map, moving on between two GPS fixes at the runner's pace
 * (`glideDistance`), updated every GLIDE_MS while `running`. Otherwise the tracker's own.
 */
export const useGlide = (state: Pick<RunState, 'distanceM' | 'paceSecPerKm' | 'targetM'>, running: boolean): number => {
  const [shown, setShown] = useState(state.distanceM);
  const fix = useRef({ m: state.distanceM, at: Date.now(), speed: 0 });
  useEffect(() => {
    fix.current = { m: state.distanceM, at: Date.now(), speed: speedFromPace(state.paceSecPerKm) };
  }, [state.distanceM, state.paceSecPerKm]);

  useEffect(() => {
    if (!running) return setShown(fix.current.m);
    const id = setInterval(() => {
      const { m, at, speed } = fix.current;
      setShown((prev) => glideDistance({ fixM: m, speedMps: speed, sinceFixMs: Date.now() - at, shownM: prev, targetM: state.targetM }));
    }, GLIDE_MS);
    return () => clearInterval(id);
  }, [running, state.targetM]);

  return running ? shown : state.distanceM;
};
