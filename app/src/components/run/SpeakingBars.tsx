import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

const H = 14;

const Bar = ({ active, delay, color }: { active: boolean; delay: number; color: string }) => {
  const level = useSharedValue(0.35);
  useEffect(() => {
    if (!active) {
      cancelAnimation(level);
      level.value = withTiming(0.35, { duration: 200 });
      return;
    }
    level.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 320, easing: Easing.inOut(Easing.quad) }), withTiming(0.3, { duration: 360, easing: Easing.inOut(Easing.quad) })), -1, true));
  }, [active, delay, level]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: level.value }] }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
};

/** Three bars that move while the voice speaks, still otherwise: the voice at a glance. */
export const SpeakingBars = ({ active, color }: { active: boolean; color: string }) => (
  <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Bar active={active} delay={0} color={color} />
    <Bar active={active} delay={140} color={color} />
    <Bar active={active} delay={70} color={color} />
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2.5, height: H },
  bar: { width: 3, height: H, borderRadius: 1.5 },
});
