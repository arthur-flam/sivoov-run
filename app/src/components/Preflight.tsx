import { StyleSheet, View } from 'react-native';
import { Body, Card } from '@/components/ui';
import { t } from '@/i18n';
import type { Check } from '@/services/preflight';
import { colors, fonts, space } from '@/theme';

const DOT: Record<Check['status'], string> = { pending: colors.muted, ok: '#2e8b57', warn: '#d97706' };

/**
 * A check: its title, and under it what to do or what is going on. A green check says nothing
 * more (the dot says it), unless it is advice worth reading every time (`advice`: the headphones).
 */
export const CheckRow = ({ title, check, testID, advice = false }: { title: string; check: Check; testID?: string; advice?: boolean }) => (
  <View style={[styles.row, check.status === 'ok' && !advice && styles.rowQuiet]} testID={testID} accessibilityLabel={`${title}: ${check.status}`}>
    <View style={[styles.dot, check.status === 'ok' && !advice && styles.dotQuiet, { backgroundColor: DOT[check.status] }]} />
    <View style={{ flex: 1 }}>
      <Body style={styles.title}>{title}</Body>
      {check.status !== 'ok' || advice ? <Body muted testID={testID ? `${testID}-message` : undefined}>{t(check.key, check.params)}</Body> : null}
    </View>
  </View>
);

export type PreflightChecks = { permission: Check; gps: Check; battery: Check; headphones: Check; pack: Check };

/** The pre-flight rows. The screen decides what the checks are; this only shows them. */
export const Preflight = ({ checks }: { checks: PreflightChecks }) => (
  <Card style={{ gap: space.sm }}>
    <CheckRow testID="check-permission" title={t('prepare.check.permission')} check={checks.permission} />
    <CheckRow testID="check-gps" title={t('run.checks.gps')} check={checks.gps} />
    <CheckRow testID="check-battery" title={t('run.checks.battery')} check={checks.battery} />
    <CheckRow testID="check-headphones" title={t('run.checks.headphones')} check={checks.headphones} advice />
    <CheckRow testID="check-pack" title={t('prepare.check.pack')} check={checks.pack} />
  </Card>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: 4 },
  rowQuiet: { alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  dotQuiet: { marginTop: 0 },
  title: { fontFamily: fonts.bodyBold },
});
