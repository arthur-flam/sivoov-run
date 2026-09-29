import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { followCamera } from '@sivoov/shared';
import type { CourseTrack } from '@sivoov/shared';
import { useOnScreen } from '@/hooks/useOnScreen';
import { focusOf, jumpShot, nextCameraPlan, normalizeTurn, overviewBounds } from './mapConfig';
import type { CameraPlan, CameraShot, Pose, RunMapView } from './mapConfig';

type Options = {
  track: CourseTrack;
  officialM: number;
  runM: number;
  /** How fast `runM` moves on, m/s on the phone's clock. */
  speedMps: number;
  view: RunMapView;
  turn: number;
  onTurn: (turn: number) => void;
  /** Puts the camera there at once (a turn under the finger). */
  jump: (shot: CameraShot) => void;
};

/**
 * The run map's camera, the same on a phone and in a browser: the planned shot (mapConfig.ts),
 * and the turn under the runner's finger. While a finger turns the map the plan holds still and
 * every move goes to the map at once, with no animation and no redraw of the screen; let go, the
 * turn is the runner's (`onTurn`) and the plan carries on from it. `following`: the camera is
 * settled behind the runner, who is then drawn at its focus (`focus`), still on screen while the
 * map moves under them.
 */
export const useRunCamera = ({ track, officialM, runM, speedMps, view, turn, onTurn, jump }: Options) => {
  const plan = useRef<CameraPlan | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const bounds = useMemo(() => overviewBounds(track), [track]);
  const drag = useRef<number | null>(null);
  // The turn just let go of, until the screen's own state has it: no frame goes back to the old one.
  const letGo = useRef<number | null>(null);
  if (letGo.current !== null && letGo.current === turn) letGo.current = null;

  // Off screen the map is not drawn: no moves are sent to it, and back on screen the plan, gone
  // stale, puts the camera on the runner at once (nextCameraPlan).
  const onScreen = useOnScreen();
  const here = followCamera(track, officialM, runM);
  const at = (ms: number): Pose => (ms === 0 || speedMps === 0 ? here : followCamera(track, officialM, Math.min(officialM, runM + (speedMps * ms) / 1000)));
  if (drag.current === null && (onScreen || plan.current === null)) plan.current = nextCameraPlan(plan.current, view, at, bounds, Date.now(), { turn: letGo.current ?? turn });
  const shot = plan.current!.shot;

  const jumpNow = () => {
    if (drag.current !== null) jump(jumpShot(view, here, bounds, drag.current));
  };
  const latest = useRef({ jump: jumpNow, turn, onTurn });
  latest.current = { jump: jumpNow, turn: letGo.current ?? turn, onTurn };
  // During a turn the runner moves on: the camera keeps up at each frame of the glide.
  useEffect(() => {
    latest.current.jump();
  });

  const surface = useMemo(
    () => ({
      onStart: () => {
        drag.current = latest.current.turn;
      },
      onTurnBy: (deg: number) => {
        if (drag.current === null) return;
        drag.current = normalizeTurn(drag.current + deg);
        latest.current.jump();
      },
      onEnd: () => {
        const turned = drag.current;
        drag.current = null;
        if (turned === null) return;
        letGo.current = turned;
        latest.current.onTurn(turned);
      },
    }),
    [],
  );

  return {
    shot,
    here,
    following: shot.kind === 'follow' && shot.mode !== 'fly',
    /** Where the followed runner is on screen. */
    focus: focusOf('follow', size.w, size.h),
    /** Where a finger turns the map around. */
    pivot: focusOf(view, size.w, size.h),
    surface,
    onLayout: (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }),
  };
};
