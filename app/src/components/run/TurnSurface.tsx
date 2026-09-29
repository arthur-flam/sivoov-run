import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';

/** A finger moving less than this is a tap, not a turn. */
const SLOP_PX = 4;
/** Closer to the pivot than this, a finger's angle around it jumps about: it is not read. */
const DEAD_PX = 36;

const degrees = (dx: number, dy: number) => (Math.atan2(dy, dx) * 180) / Math.PI;

/** The shortest way from one angle to the next, degrees. */
const delta = (from: number, to: number): number => ((((to - from + 180) % 360) + 360) % 360) - 180;

/**
 * What the fingers hold, as an angle on screen (clockwise): two fingers, the line between them;
 * one finger, its direction from the pivot. Null when one finger is too close to the pivot to say.
 */
const grip = (e: GestureResponderEvent, pivot: { x: number; y: number }): { fingers: number; angle: number } | null => {
  const { touches, locationX, locationY } = e.nativeEvent;
  const [a, b] = touches;
  if (a && b) return { fingers: 2, angle: degrees(b.pageX - a.pageX, b.pageY - a.pageY) };
  const dx = locationX - pivot.x;
  const dy = locationY - pivot.y;
  return Math.hypot(dx, dy) < DEAD_PX ? null : { fingers: 1, angle: degrees(dx, dy) };
};

type Props = {
  /** The point the map turns around, in this surface's pixels: the runner, or the middle of the course. */
  pivot: { x: number; y: number };
  onStart: () => void;
  /** The map turned by `deg` (positive: the view turns right, the ground turns left). */
  onTurnBy: (deg: number) => void;
  onEnd: () => void;
  /** Kept clear at the bottom: the map's logo and attribution stay tappable. */
  bottom: number;
};

/**
 * Over the run map, the one gesture it takes: turning it. A finger put on the map drags the
 * ground round the runner, as if holding it; two fingers twist it like any map. No pan and no
 * zoom: the camera stays on the runner, the fingers only choose the angle.
 */
export const TurnSurface = ({ pivot, onStart, onTurnBy, onEnd, bottom }: Props) => {
  const props = useRef({ pivot, onStart, onTurnBy, onEnd });
  props.current = { pivot, onStart, onTurnBy, onEnd };
  const last = useRef<{ fingers: number; angle: number } | null>(null);
  const responder = useMemo(() => {
    const follow = (e: GestureResponderEvent) => {
      const now = grip(e, props.current.pivot);
      const prev = last.current;
      last.current = now;
      if (now && prev && now.fingers === prev.fingers) props.current.onTurnBy(-delta(prev.angle, now.angle));
    };
    const release = () => {
      last.current = null;
      props.current.onEnd();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.numberActiveTouches > 1 || Math.hypot(g.dx, g.dy) > SLOP_PX,
      onPanResponderGrant: (e, g) => {
        // From where the finger came down: the move that crossed the slop is part of the turn.
        const start = { nativeEvent: { ...e.nativeEvent, locationX: e.nativeEvent.locationX - g.dx, locationY: e.nativeEvent.locationY - g.dy } } as GestureResponderEvent;
        last.current = grip(g.numberActiveTouches > 1 ? e : start, props.current.pivot);
        props.current.onStart();
        follow(e);
      },
      onPanResponderMove: follow,
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
      onPanResponderTerminationRequest: () => false,
    });
  }, []);
  return <View style={[StyleSheet.absoluteFill, { bottom }]} testID="map-turn" {...responder.panHandlers} />;
};
