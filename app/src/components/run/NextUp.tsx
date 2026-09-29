import { StyleSheet, Text, View } from 'react-native';
import { formatDistanceAway } from '@sivoov/shared';
import type { Ahead } from '@sivoov/shared';
import { locale, t } from '@/i18n';
import { colors, fonts } from '@/theme';
import { PlaceIcon } from './icons';

/** The next place on the course and how far it is, or the finish once they are all behind. */
export const NextUp = ({ ahead, accent }: { ahead: Ahead; accent: string }) => (
  <View style={styles.row} accessible accessibilityLabel={`${t('run.next')} : ${ahead.kind === 'landmark' ? ahead.name : t('run.finish')}, ${t('run.in', { distance: formatDistanceAway(ahead.inM, locale) })}`}>
    <PlaceIcon color={ahead.kind === 'finish' ? colors.snow : accent} />
    <Text testID="next-landmark" style={styles.name} numberOfLines={1}>
      {ahead.kind === 'landmark' ? ahead.name : t('run.finish')}
    </Text>
    <Text style={styles.in}>{t('run.in', { distance: formatDistanceAway(ahead.inM, locale) })}</Text>
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  name: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 17, color: colors.snow },
  in: { fontFamily: fonts.num, fontSize: 19, color: colors.fog, fontVariant: ['tabular-nums'] },
});
