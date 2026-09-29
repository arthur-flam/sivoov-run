import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '@/theme';

/** The countdown's digit: each second lands, a little larger, then settles. */
export const CountdownDigit = ({ value }: { value: number }) => {
  const beat = useSharedValue(0);
  useEffect(() => {
    beat.value = withSequence(withTiming(1, { duration: 0 }), withTiming(0, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [value, beat]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - beat.value * 0.6, transform: [{ scale: 1 + beat.value * 0.25 }] }));
  return (
    <Animated.Text testID="countdown" style={[styles.digit, style]}>
      {value}
    </Animated.Text>
  );
};

const styles = StyleSheet.create({
  digit: { fontFamily: fonts.numBold, fontSize: 200, lineHeight: 204, color: colors.snow, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
