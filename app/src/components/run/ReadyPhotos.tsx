import { useState } from 'react';
import { View } from 'react-native';
import type { CourseMoment } from '@sivoov/shared';
import { Body, Button } from '@/components/ui';
import { t } from '@/i18n';
import { picker, takeSelfie } from '@/photos/picker';
import { usePhotos } from '@/stores/photos';
import { space } from '@/theme';

type Props = { moments: CourseMoment[]; token: string | null; officialM: number };

/**
 * On the line, before Start: the photo moments of the course, so the runner knows to take a
 * selfie at each with their own camera, and the start's selfie right here when the course has
 * one. Nothing is made now: the pictures come after the finish.
 */
export const ReadyPhotos = ({ moments, token, officialM }: Props) => {
  const [sent, setSent] = useState(false);
  const send = usePhotos((s) => s.send);
  const busy = usePhotos((s) => s.busy);
  if (moments.length === 0) return null;
  const start = moments.find((m) => m.meters <= 0);
  const selfie = async () => {
    const photo = token && start ? await takeSelfie() : null;
    if (!photo || !token || !start) return;
    const { sent: n } = await send(token, [photo], null, officialM, start.id);
    setSent(n > 0);
  };
  return (
    <View style={{ gap: space.xs }} testID="ready-photos">
      <Body dark style={{ fontWeight: '700' }}>
        {t('ready.photos.title')}
      </Body>
      <Body dark muted>
        {t('ready.photos.body', { moments: moments.map((m) => m.title).join(' · ') })}
      </Body>
      {start && picker ? (
        <Button testID="start-selfie" label={sent ? t('ready.photos.selfieDone') : t('ready.photos.selfie')} ghost dark disabled={sent} loading={busy === 'sending'} onPress={() => void selfie()} />
      ) : null}
    </View>
  );
};
