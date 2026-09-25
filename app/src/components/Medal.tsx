import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import { toDiagram } from '@sivoov/shared';
import type { CourseTrack } from '@sivoov/shared';

type Props = { track: CourseTrack; ribbon: string; stripe: string; image?: string; size?: number };

/**
 * The finish line's one flourish: a medal whose face is the course just run, on the race's
 * ribbon. It lands once (a spring, core Animated, no worklets) and then stays still. When the
 * organizer has sent a photo of the real medal, that is shown instead.
 */
export const Medal = ({ track, ribbon, stripe, image, size = 160 }: Props) => {
  const landed = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(landed, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
  }, [landed]);
  const swing = landed.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] });
  const style = { opacity: landed.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], easing: Easing.out(Easing.quad) }), transform: [{ translateY: landed.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }, { rotate: swing }, { scale: landed.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] };

  if (image) {
    return (
      <Animated.View style={[styles.wrap, style]} testID="medal">
        <Image source={{ uri: image }} style={{ width: size, height: size * 1.25 }} resizeMode="contain" />
      </Animated.View>
    );
  }

  // Drawn on a 160 x 200 grid: ribbon straps above, the disc below them.
  const face = toDiagram(track, 64, 64, 0);
  const d = face.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x + 48).toFixed(1)} ${(p.y + 96).toFixed(1)}`).join(' ');
  return (
    <Animated.View style={[styles.wrap, style]} testID="medal">
      <Svg width={size} height={size * 1.25} viewBox="0 0 160 200">
        <Defs>
          <LinearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#f6e3a1" />
            <Stop offset="0.45" stopColor="#d4ab4a" />
            <Stop offset="0.7" stopColor="#b88a2b" />
            <Stop offset="1" stopColor="#efd27e" />
          </LinearGradient>
        </Defs>
        <Polygon points="122,0 90,0 66,84 98,84" fill={ribbon} opacity={0.8} />
        <Polygon points="38,0 70,0 94,84 62,84" fill={ribbon} />
        <Path d="M54 0 L78 84" stroke={stripe} strokeWidth={4} opacity={0.9} />
        <Circle cx={80} cy={130} r={62} fill="url(#gold)" />
        <Circle cx={80} cy={130} r={53} fill="none" stroke="#9c7420" strokeWidth={1.5} opacity={0.7} />
        <Path d={d} fill="none" stroke="#6f5213" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
});
