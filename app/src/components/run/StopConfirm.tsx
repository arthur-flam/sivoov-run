import { View } from 'react-native';
import { Body, Button } from '@/components/ui';
import { t } from '@/i18n';
import { colors, space } from '@/theme';
import { Sheet } from './Sheet';

/**
 * The second step of stopping: what stopping means, said once. Carrying on is the big button;
 * the run keeps counting underneath while the runner decides.
 */
export const StopConfirm = ({ distance, onKeep, onStop }: { distance: string; onKeep: () => void; onStop: () => void }) => (
  <Sheet title={t('run.stop.title')} onClose={onKeep} closeLabel={t('run.stop.keep')} testID="stop-confirm">
    <Body dark muted>
      {t('run.stop.body', { distance })}
    </Body>
    <View style={{ gap: space.sm, paddingTop: space.sm }}>
      <Button testID="stop-keep" label={t('run.stop.keep')} color={colors.snow} onColor={colors.ink} onPress={onKeep} />
      <Button testID="stop-confirm-button" label={t('run.stop.confirm')} ghost dark onPress={onStop} />
    </View>
  </Sheet>
);
