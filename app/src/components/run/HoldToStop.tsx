import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { t } from '@/i18n';
import { colors, fonts } from '@/theme';
import { StopIcon } from './icons';

/** How long the runner holds before the stop is asked for: long enough that a pocket never does it. */
export const HOLD_MS = 1500;

const SIZE = 64;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const RING = 2 * Math.PI * R;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const buzz = (style: Haptics.ImpactFeedbackStyle) => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(style).catch(() => undefined);
};

/**
 * The stop control: a ring fills while the runner holds, a light tap on the phone as it starts
 * and a firm one when it is full, then `onHeld` (the screen asks to confirm). Let go early and
 * the ring drains back, with the instruction shown for a moment. A screen reader's activation
 * goes straight to the confirmation.
 */
export const HoldToStop = ({ onHeld }: { onHeld: () => void }) => {
  const progress = useSharedValue(0);
  const hint = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const ring = useAnimatedProps(() => ({ strokeDashoffset: RING * (1 - progress.value) }));
  const press = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.06 * Math.min(1, progress.value * 4) }] }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value, transform: [{ translateY: (1 - hint.value) * 6 }] }));

  const begin = () => {
    buzz(Haptics.ImpactFeedbackStyle.Light);
    hint.value = withTiming(1, { duration: 150 });
    progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear });
    timer.current = setTimeout(() => {
      timer.current = null;
      buzz(Haptics.ImpactFeedbackStyle.Heavy);
      progress.value = withTiming(0, { duration: 250 });
      hint.value = withTiming(0, { duration: 150 });
      onHeld();
    }, HOLD_MS);
  };

  const end = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    progress.value = withTiming(0, { duration: 220 });
    hint.value = withDelay(1600, withTiming(0, { duration: 300 }));
  };

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.hint, hintStyle]} pointerEvents="none">
        <Text style={styles.hintText} numberOfLines={1}>
          {t('run.stop.hint')}
        </Text>
      </Animated.View>
      <Pressable
        testID="stop"
        accessibilityRole="button"
        accessibilityLabel={t('run.stop')}
        accessibilityHint={t('run.stop.hint')}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onHeld}
        onPressIn={begin}
        onPressOut={end}
        hitSlop={8}
      >
        <Animated.View style={[styles.button, press]}>
          <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.nightBorder} strokeWidth={STROKE} fill="none" />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={colors.snow}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${RING} ${RING}`}
              strokeLinecap="round"
              animatedProps={ring}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>
          <StopIcon color={colors.snow} size={24} />
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end' },
  button: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nightCard },
  hint: { position: 'absolute', bottom: SIZE + 10, right: 0, backgroundColor: colors.snow, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  hintText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
});
