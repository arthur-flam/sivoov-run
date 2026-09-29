import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LocaleSchema } from '@sivoov/shared';
import { t, useLocale } from '@/i18n';
import { useLanguage } from '@/stores/language';
import { useSession } from '@/stores/session';
import { colors, fonts, radius, space } from '@/theme';

/**
 * Français | English, each written in its own language so a runner finds theirs whatever the
 * screen says. The choice applies at once; signed in, it is also the runner's for the emails.
 */
export const LanguagePicker = () => {
  const locale = useLocale();
  const token = useSession((s) => s.token);
  const choose = useLanguage((s) => s.choose);
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('language.label')}>
      {LocaleSchema.options.map((l) => {
        const on = l === locale;
        return (
          <Pressable
            key={l}
            testID={`language-${l}`}
            onPress={() => void choose(l, token)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            hitSlop={6}
            style={[styles.option, on && styles.optionOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{t(`language.${l}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'center', gap: space.xs, padding: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  option: { paddingVertical: 6, paddingHorizontal: space.md, borderRadius: radius.pill },
  optionOn: { backgroundColor: colors.ink },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink2 },
  labelOn: { color: colors.snow },
});
