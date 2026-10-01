import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '@/theme';

type Props = { icon: ReactNode; label: string; value: string; onPress: () => void; testID?: string };

/** A control of the run screen: big enough for a moving thumb, its current setting under its name. */
export const Control = ({ icon, label, value, onPress, testID }: Props) => (
  <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} style={({ pressed }) => [styles.box, pressed && styles.pressed]}>
    {icon}
    <View style={styles.text}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.value} numberOfLines={2}>
        {value}
      </Text>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  box: { flex: 1, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.nightCard, borderWidth: 1, borderColor: colors.nightBorder },
  pressed: { opacity: 0.7 },
  text: { flex: 1 },
  label: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.snow },
  value: { fontFamily: fonts.body, fontSize: 13, color: colors.fog },
});
