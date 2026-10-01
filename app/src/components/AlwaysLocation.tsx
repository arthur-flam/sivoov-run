import { View } from 'react-native';
import { Body, Button, Card } from '@/components/ui';
import { t } from '@/i18n';
import { space } from '@/theme';

/**
 * Step two of the location permission, on Android: why « Toujours » before Android's own page
 * asks for it. It is also the in-app disclosure Google Play requires before a background
 * location request: what is collected, that it goes on with the app closed, and what for.
 */
export const AlwaysLocation = ({ color, onColor, onAsk }: { color?: string; onColor?: string; onAsk: () => void }) => (
  <Card style={{ gap: space.sm }}>
    <Body style={{ fontWeight: '600' }}>{t('prepare.always.title')}</Body>
    <Body>{t('prepare.always.why')}</Body>
    <Body muted>{t('prepare.always.how')}</Body>
    <View>
      <Button testID="ask-always" label={t('prepare.always.button')} color={color} onColor={onColor} onPress={onAsk} />
    </View>
  </Card>
);
