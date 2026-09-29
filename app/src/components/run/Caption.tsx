import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { SaidLine, SpeechTiming } from '@/audio/said';
import { t } from '@/i18n';
import { colors, fonts, radius, space } from '@/theme';
import { captionScroll } from './captionScroll';
import { CloseIcon } from './icons';
import { SpeakingBars } from './SpeakingBars';

type Props = {
  line: SaidLine | null;
  speaking: boolean;
  /** When the line's sound began and how long it lasts: long words scroll with it. */
  timing?: SpeechTiming | null;
  onPress?: () => void;
  /** The runner hides this line's words (they stay in the list of announcements). */
  onHide?: () => void;
  /** The start ceremony's words, large, filling the panel they are in. */
  large?: boolean;
  testID?: string;
};

/**
 * What the voice is saying, as subtitles: the line's words (its title when an older pack has
 * none), the moving bars while it speaks. Rises in when a line starts, fades when it is over.
 * Words longer than the box scroll up as they are said. A tap opens the list of every
 * announcement; the cross hides the words over the map until the next line.
 */
export const Caption = ({ line, speaking, timing = null, onPress, onHide, large = false, testID = 'now-playing' }: Props) => {
  const [shownLine, setShownLine] = useState<SaidLine | null>(line);
  const shown = useSharedValue(line ? 1 : 0);
  const offset = useSharedValue(0);
  const [windowH, setWindowH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const scrolled = useRef<string | null>(null);

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

  // The words scroll with the sound; a new line starts at its top; a line with no timing holds still.
  const key = shownLine?.key ?? null;
  const startedAt = timing?.startedAt ?? null;
  const durationMs = timing?.durationMs ?? 0;
  useEffect(() => {
    if (key !== scrolled.current) {
      scrolled.current = key;
      cancelAnimation(offset);
      offset.value = 0;
    }
    if (startedAt === null || windowH === 0 || contentH === 0) return;
    const scroll = captionScroll({ contentH, windowH, elapsedMs: Date.now() - startedAt, durationMs });
    cancelAnimation(offset);
    offset.value = scroll.from;
    if (scroll.to > scroll.from) offset.value = withDelay(scroll.delayMs, withTiming(scroll.to, { duration: scroll.durationMs, easing: Easing.linear }));
  }, [key, startedAt, durationMs, windowH, contentH, offset]);

  const style = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 10 }] }));
  const scrollStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -offset.value }] }));
  if (!shownLine) return null;
  const title = shownLine.event.title ?? '';
  const words = shownLine.text ?? title;
  return (
    <Animated.View style={[style, large && styles.fill]} pointerEvents={line ? 'auto' : 'none'}>
      <View testID={line ? testID : undefined} accessibilityLiveRegion="polite" style={[styles.box, large && styles.boxLarge]}>
        <View style={styles.head}>
          <SpeakingBars active={speaking} color={colors.snow} />
          <Text style={styles.title} numberOfLines={1}>
            {shownLine.text && title ? title : ''}
          </Text>
          {onHide ? (
            <Pressable testID="caption-hide" onPress={onHide} hitSlop={14} accessibilityRole="button" accessibilityLabel={t('run.caption.hide')} style={styles.hide}>
              <CloseIcon size={16} color={colors.fog} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} style={large ? styles.windowLarge : styles.window} onLayout={(e) => setWindowH(e.nativeEvent.layout.height)}>
          <Animated.View style={scrollStyle} onLayout={(e) => setContentH(e.nativeEvent.layout.height)}>
            <Text style={[styles.words, large && styles.wordsLarge]}>{words}</Text>
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
};

/** Three lines of words over the map; the rest scrolls. */
const WORDS_LINE = 23;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  box: { backgroundColor: 'rgba(12,12,12,0.88)', borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, gap: 6 },
  boxLarge: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 18 },
  title: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.fog },
  hide: { padding: 2, marginRight: -4 },
  window: { maxHeight: WORDS_LINE * 3, overflow: 'hidden' },
  windowLarge: { flex: 1, overflow: 'hidden' },
  words: { fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: WORDS_LINE, color: colors.snow },
  wordsLarge: { fontFamily: fonts.display, fontSize: 24, lineHeight: 31 },
});
