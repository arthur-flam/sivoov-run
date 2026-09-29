import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { SaidLine } from '@/audio/said';
import { colors, fonts, radius, space } from '@/theme';
import { SpeakingBars } from './SpeakingBars';

type Props = { line: SaidLine | null; speaking: boolean; onPress?: () => void; large?: boolean; testID?: string };

/**
 * What the voice is saying, as subtitles: the line's words (its title when an older pack has
 * none), the moving bars while it speaks. Rises in when a line starts, fades when it is over.
 * A tap opens the list of every announcement.
 */
export const Caption = ({ line, speaking, onPress, large = false, testID = 'now-playing' }: Props) => {
  const [shownLine, setShownLine] = useState<SaidLine | null>(line);
  const shown = useSharedValue(line ? 1 : 0);
  useEffect(() => {
    if (line) {
      setShownLine(line);
      shown.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
      return;
    }
    shown.value = withTiming(0, { duration: 300 });
    const id = setTimeout(() => setShownLine(null), 300);
    return () => clearTimeout(id);
  }, [line, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 10 }] }));
  if (!shownLine) return null;
  const title = shownLine.event.title ?? '';
  const words = shownLine.text ?? title;
  return (
    <Animated.View style={style} pointerEvents={line ? 'auto' : 'none'}>
      <Pressable testID={line ? testID : undefined} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLiveRegion="polite" style={[styles.box, large && styles.boxLarge]}>
        <View style={styles.head}>
          <SpeakingBars active={speaking} color={colors.snow} />
          {shownLine.text && title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.words, large && styles.wordsLarge]} numberOfLines={large ? 6 : 3}>
          {words}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  box: { backgroundColor: 'rgba(12,12,12,0.88)', borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, gap: 6 },
  boxLarge: { backgroundColor: 'transparent', paddingHorizontal: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.fog },
  words: { fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 23, color: colors.snow },
  wordsLarge: { fontFamily: fonts.display, fontSize: 24, lineHeight: 31 },
});
