import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, space } from '@/theme';
import { CloseIcon } from './icons';

const IN_MS = 220;
const OUT_MS = 160;

type Props = { title: string; onClose: () => void; children: ReactNode; testID?: string; closeLabel: string };

/**
 * A panel over the run, from the bottom edge, over a dimmed screen: the run goes on under it.
 * Closed by its button or a tap on the dimmed part; never by a swipe (nothing on the run screen
 * moves under a sweaty thumb).
 */
export const Sheet = ({ title, onClose, children, testID, closeLabel }: Props) => {
  const insets = useSafeAreaInsets();
  const shown = useSharedValue(0);
  const closing = useRef(false);
  useEffect(() => {
    shown.value = withTiming(1, { duration: IN_MS, easing: Easing.out(Easing.cubic) });
  }, [shown]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    shown.value = withTiming(0, { duration: OUT_MS });
    setTimeout(onClose, OUT_MS);
  };

  const backdrop = useAnimatedStyle(() => ({ opacity: shown.value }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - shown.value) * 48 }], opacity: shown.value }));

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={closeLabel} />
      </Animated.View>
      <Animated.View style={[styles.panel, { paddingBottom: insets.bottom + space.md }, panel]} accessibilityViewIsModal>
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={12} style={styles.close} testID={testID ? `${testID}-close` : undefined}>
            <CloseIcon color={colors.snow} />
          </Pressable>
        </View>
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '82%',
    backgroundColor: colors.nightCard,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.nightBorder,
    paddingTop: space.md,
    paddingHorizontal: space.md,
    gap: space.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.snow },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nightBorder },
});
