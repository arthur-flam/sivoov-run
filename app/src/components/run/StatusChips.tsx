import { StyleSheet, Text, View } from 'react-native';
import type { GpsSignal } from '@sivoov/shared';
import { t } from '@/i18n';
import { colors, fonts, radius } from '@/theme';
import { Dot } from './icons';

const Chip = ({ label, dot, testID }: { label: string; dot?: string; testID?: string }) => (
  <View style={styles.chip} testID={testID}>
    {dot ? <Dot color={dot} /> : null}
    <Text style={styles.text} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

/**
 * Over the top of the map: the race, and only what needs the runner's attention: the GPS when
 * it is not good, the simulation badge in development. A good GPS says nothing.
 */
export const StatusChips = ({ race, gps, simulation }: { race: string; gps: GpsSignal | null; simulation: boolean }) => (
  <View style={styles.row} pointerEvents="none">
    <View style={styles.side}>
      <Chip label={race} />
    </View>
    <View style={[styles.side, styles.end]}>
      {gps && gps !== 'good' ? <Chip testID={`gps-${gps}`} label={t(`run.gps.${gps}`)} dot={gps === 'searching' ? colors.fog : colors.coral} /> : null}
      {simulation ? <Chip testID="sim-badge-live" label={t('run.sim.badge')} /> : null}
    </View>
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  side: { flexDirection: 'row', gap: 6, flexShrink: 1 },
  end: { justifyContent: 'flex-end' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(12,12,12,0.78)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, flexShrink: 1 },
  text: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.snow },
});
