import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent, PanResponderGestureState } from 'react-native';

/** Degrees the map turns for a pixel of finger across the screen. */
const DEG_PER_PX = 0.3;
/** A finger moving less than this across is a tap or a scroll, not a turn. */
const SLOP_PX = 6;

/** The angle between two fingers, degrees, clockwise on screen; null with fewer than two. */
const twist = (e: GestureResponderEvent): number | null => {
  const [a, b] = e.nativeEvent.touches;
  return a && b ? (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI : null;
};

/** The shortest way from one angle to the next, degrees. */
const delta = (from: number, to: number): number => ((((to - from + 180) % 360) + 360) % 360) - 180;

type Props = {
  /** The map turned by `deg` (positive: the view turns right, the ground slides left). */
  onTurn: (deg: number) => void;
  /** Kept clear at the bottom: the map's logo and attribution stay tappable. */
  bottom: number;
};

/**
 * Over the run map, the one gesture it takes: turning it. Two fingers twist it like a map; one
 * finger dragged across swings it round the runner. No pan and no zoom: the camera stays on
 * the runner, the finger only chooses the angle.
 */
export const TurnSurface = ({ onTurn, bottom }: Props) => {
  const turn = useRef(onTurn);
  turn.current = onTurn;
  const last = useRef<{ dx: number; angle: number | null }>({ dx: 0, angle: null });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (e: GestureResponderEvent, g: PanResponderGestureState) => g.numberActiveTouches > 1 || Math.abs(g.dx) > SLOP_PX,
        // The turn counts from where the finger came down: the slop is part of it.
        onPanResponderGrant: (e) => {
          last.current = { dx: 0, angle: twist(e) };
        },
        onPanResponderMove: (e, g) => {
          const angle = twist(e);
          const prev = last.current;
          last.current = { dx: g.dx, angle };
          if (angle !== null && prev.angle !== null) turn.current(-delta(prev.angle, angle));
          else if (angle === null && prev.angle === null) turn.current(-(g.dx - prev.dx) * DEG_PER_PX);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );
  return <View style={[StyleSheet.absoluteFill, { bottom }]} testID="map-turn" {...responder.panHandlers} />;
};
