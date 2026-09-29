import { StyleSheet, Text, View } from 'react-native';
import { formatClock, formatKm, formatPace } from '@sivoov/shared';
import type { RunState } from '@sivoov/shared';
import { locale, t } from '@/i18n';
import { colors, fonts } from '@/theme';

/** The distance first and biggest, then the race clock and the pace: the order a runner glances in. */
/** `ofLabel`: the course's distance as the race names it (« 42,195 km », « 10 km »). */
export const Numbers = ({ state, ofLabel }: { state: Pick<RunState, 'distanceM' | 'elapsedMs' | 'paceSecPerKm'>; ofLabel: string }) => {
  const distance = formatKm(state.distanceM, locale).replace(' km', '');
  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text testID="distance" style={styles.distance} accessibilityLabel={formatKm(state.distanceM, locale)}>
          {distance}
          <Text style={styles.unit}> {t('run.unit.km')}</Text>
        </Text>
        <Text style={styles.of}>{t('run.of', { distance: ofLabel })}</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.label}>{t('run.elapsed')}</Text>
          <Text testID="elapsed" style={styles.stat}>
            {formatClock(state.elapsedMs)}
          </Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.label}>{t('common.pace')}</Text>
          <Text style={styles.stat}>
            <Text testID="pace">{formatPace(state.paceSecPerKm)}</Text>
            <Text style={styles.statUnit}> {t('run.unit.pace')}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
};

const num = { fontFamily: fonts.numBold, color: colors.snow, fontVariant: ['tabular-nums' as const] };

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  distance: { ...num, fontSize: 96, lineHeight: 96, letterSpacing: -1 },
  unit: { fontFamily: fonts.num, fontSize: 30, color: colors.fog, letterSpacing: 0 },
  of: { fontFamily: fonts.num, fontSize: 17, color: colors.fog, paddingBottom: 14, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 16 },
  cell: { flex: 1 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.fog },
  stat: { ...num, fontSize: 64, lineHeight: 66 },
  statUnit: { fontFamily: fonts.num, fontSize: 22, color: colors.fog },
});
