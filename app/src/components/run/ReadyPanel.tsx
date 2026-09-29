import { View } from 'react-native';
import { Body, Button, Display } from '@/components/ui';
import type { MapDownload } from '@/hooks/useMapDownload';
import { t } from '@/i18n';
import { space } from '@/theme';

type Props = {
  who: string;
  error: string | null;
  simulation: string | null;
  map: MapDownload;
  color: string;
  onColor: string;
  onStart: () => void;
  onBack: () => void;
};

/** Before the start: who is running what, anything wrong with the last try, and the start button under the thumb. */
export const ReadyPanel = ({ who, error, simulation, map, color, onColor, onStart, onBack }: Props) => (
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
      {map.status === 'saving' || map.status === 'saved' ? (
        <Body dark muted style={{ fontSize: 13 }} testID="map-download">
          {map.status === 'saving' ? `${t('run.map.saving')} · ${map.percent} %` : t('run.map.saved')}
        </Body>
      ) : null}
    </View>
    <Button testID="start" label={t('run.start')} color={color} onColor={onColor} onPress={onStart} />
    <Button label={t('common.back')} ghost dark onPress={onBack} />
  </View>
);
