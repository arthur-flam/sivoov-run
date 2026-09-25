import { StyleSheet, View } from 'react-native';
import { Body, Card } from '@/components/ui';
import { t } from '@/i18n';
import type { Check } from '@/services/preflight';
import { colors, fonts, space } from '@/theme';

const DOT: Record<Check['status'], string> = { pending: colors.muted, ok: '#2e8b57', warn: '#d97706' };

export const CheckRow = ({ title, check, testID }: { title: string; check: Check; testID?: string }) => (
  <View style={styles.row} testID={testID} accessibilityLabel={`${title}: ${check.status}`}>
    <View style={[styles.dot, { backgroundColor: DOT[check.status] }]} />
    <View style={{ flex: 1 }}>
      <Body style={styles.title}>{title}</Body>
      <Body muted testID={testID ? `${testID}-message` : undefined}>{t(check.key, check.params)}</Body>
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
    <CheckRow testID="check-headphones" title={t('run.checks.headphones')} check={checks.headphones} />
    <CheckRow testID="check-pack" title={t('prepare.check.pack')} check={checks.pack} />
  </Card>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: 4 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  title: { fontFamily: fonts.bodyBold },
});
