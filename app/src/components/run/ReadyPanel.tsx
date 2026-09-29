import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Body, Button, Display } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme';

type Props = {
  who: string;
  error: string | null;
  simulation: string | null;
  color: string;
  onColor: string;
  onStart: () => void;
  onBack: () => void;
  /** The course's photo moments, for a run that counts. */
  photos?: ReactNode;
};

/** Before the start: who is running what, anything wrong with the last try, and the start button under the thumb. */
export const ReadyPanel = ({ who, error, simulation, color, onColor, onStart, onBack, photos }: Props) => (
  <View style={{ gap: space.md }}>
    <View style={{ gap: space.xs }}>
      <Display dark>{t('run.ready')}</Display>
      <Body dark muted>
        {who}
      </Body>
      {error ? (
        <Body dark testID="start-error">
          {error === 'location_denied' ? t('prepare.check.permission.denied') : t('run.startFailed')}
        </Body>
      ) : null}
      {simulation ? (
        <Body dark muted testID="sim-badge">
          {simulation}
        </Body>
      ) : null}
    </View>
    {photos ?? null}
    <Button testID="start" label={t('run.start')} color={color} onColor={onColor} onPress={onStart} />
    <Button label={t('common.back')} ghost dark onPress={onBack} />
  </View>
);
