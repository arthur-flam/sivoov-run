import { View } from 'react-native';
import { Body, Button, Display } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme';

type Props = {
  who: string;
  /** « 12,4 km », where the run stood at its last fix. */
  distance: string;
  /** « 1:04:12 », the race clock now: it never stopped. */
  clock: string;
  error: string | null;
  color: string;
  onColor: string;
  onResume: () => void;
  onStop: () => void;
};

/**
 * A run that came back (the phone restarted, the app was closed or crashed) goes on by itself;
 * this shows only when it could not (the GPS would not start again). Carrying on is the big
 * button, from where the runner is now; stopping keeps and sends what was run.
 */
export const ResumePanel = ({ who, distance, clock, error, color, onColor, onResume, onStop }: Props) => (
  <View style={{ gap: space.md }} testID="resume-panel">
    <View style={{ gap: space.xs }}>
      <Display dark>{t('run.resume.title')}</Display>
      <Body dark muted>
        {who}
      </Body>
      <Body dark>{t('run.resume.body', { distance, clock })}</Body>
      {error ? (
        <Body dark testID="start-error">
          {error === 'location_denied' ? t('prepare.check.permission.denied') : t('run.startFailed')}
        </Body>
      ) : null}
    </View>
    <Button testID="resume" label={t('run.resume.go')} color={color} onColor={onColor} onPress={onResume} />
    <Button testID="resume-stop" label={t('run.resume.stop')} ghost dark onPress={onStop} />
  </View>
);
