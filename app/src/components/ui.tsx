import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { colors, fonts, radius, space } from '@/theme';

export const Screen = ({ children, dark = false, style }: { children: ReactNode; dark?: boolean; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.screen, dark && styles.screenDark, style]}>{children}</View>
);

export const Display = ({ children, style, dark = false }: { children: ReactNode; style?: StyleProp<TextStyle>; dark?: boolean }) => (
  <Text style={[styles.display, dark && { color: colors.snow }, style]}>{children}</Text>
);

export const Body = ({ children, muted = false, dark = false, style, testID }: { children: ReactNode; muted?: boolean; dark?: boolean; style?: StyleProp<TextStyle>; testID?: string }) => (
  <Text testID={testID} style={[styles.body, muted && { color: colors.ink2 }, dark && { color: muted ? colors.fog : colors.snow }, style]}>{children}</Text>
);

export const Eyebrow = ({ children, dark = false }: { children: ReactNode; dark?: boolean }) => (
  <Text style={[styles.eyebrow, dark && { color: colors.coral }]}>{children}</Text>
);

/** Numbers are the hero of a race: condensed, tabular, big. */
export const Num = ({ children, size = 64, dark = false, style, testID }: { children: ReactNode; size?: number; dark?: boolean; style?: StyleProp<TextStyle>; testID?: string }) => (
  <Text testID={testID} style={[styles.num, { fontSize: size, lineHeight: size * 1.02 }, dark && { color: colors.snow }, style]}>{children}</Text>
);

type ButtonProps = { label: string; onPress: () => void; color?: string; onColor?: string; ghost?: boolean; dark?: boolean; disabled?: boolean; loading?: boolean; testID?: string; onLongPress?: () => void; delayLongPress?: number };

/** `dark` is for the night screens: a ghost label is near-black by default and vanishes there. */
export const Button = ({ label, onPress, color = colors.ink, onColor = colors.snow, ghost, dark, disabled, loading, testID, onLongPress, delayLongPress }: ButtonProps) => {
  const ghostLabel = dark ? colors.snow : colors.ink;
  return (
  <Pressable
    testID={testID}
    accessibilityRole="button"
    onPress={onPress}
    onLongPress={onLongPress}
    delayLongPress={delayLongPress}
    disabled={disabled || loading}
    style={({ pressed }) => [styles.button, ghost ? styles.buttonGhost : { backgroundColor: color }, (pressed || disabled) && { opacity: 0.7 }]}
  >
    {loading ? <ActivityIndicator color={ghost ? ghostLabel : onColor} /> : <Text style={[styles.buttonLabel, { color: ghost ? ghostLabel : onColor }]}>{label}</Text>}
  </Pressable>
  );
};

export const Card = ({ children, dark = false, style }: { children: ReactNode; dark?: boolean; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.card, dark && styles.cardDark, style]}>{children}</View>
);

export const ErrorBox = ({ children }: { children: ReactNode }) => (
  <View style={styles.error} accessibilityRole="alert">
    <Text style={styles.errorText}>{children}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: space.md },
  screenDark: { backgroundColor: colors.night },
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.ink, letterSpacing: -0.5 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.ink },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.coralName },
  num: { fontFamily: fonts.numBold, color: colors.ink, fontVariant: ['tabular-nums'] },
  button: { minHeight: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  buttonLabel: { fontFamily: fonts.bodyBold, fontSize: 17 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md },
  cardDark: { backgroundColor: colors.nightCard, borderColor: colors.nightBorder },
  error: { backgroundColor: colors.coralBg, borderColor: '#fcd9d6', borderWidth: 1, borderRadius: radius.sm, padding: space.md, marginBottom: space.md },
  errorText: { fontFamily: fonts.body, color: colors.coralName, fontSize: 15 },
});
