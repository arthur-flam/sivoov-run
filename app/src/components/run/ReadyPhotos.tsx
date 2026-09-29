import { useState } from 'react';
import { View } from 'react-native';
import type { CourseMoment } from '@sivoov/shared';
import { Body, Button } from '@/components/ui';
import { t } from '@/i18n';
import { picker } from '@/photos/picker';
import { usePhotos } from '@/stores/photos';
import { space } from '@/theme';

type Props = { moments: CourseMoment[]; token: string | null };

/**
 * On the line, before Start: the photo moments of the course (the run screen's camera comes up
 * at each), and the start's selfie right here when the course has one. Nothing is made now: the
 * pictures come after the finish, rehearsal or race alike.
 */
export const ReadyPhotos = ({ moments, token }: Props) => {
  const [taken, setTaken] = useState(false);
  const snap = usePhotos((s) => s.snap);
  if (moments.length === 0) return null;
  const start = moments.find((m) => m.meters <= 0);
  const selfie = async () => {
    if (token && start) setTaken(await snap(token, start.id));
  };
  return (
    <View style={{ gap: space.xs }} testID="ready-photos">
      <Body dark style={{ fontWeight: '700' }}>
        {t('ready.photos.title')}
      </Body>
      <Body dark muted>
        {t(picker ? 'ready.photos.body' : 'ready.photos.bodyOwnCamera', { moments: moments.map((m) => m.title).join(' · ') })}
      </Body>
      {start && picker ? (
        <Button testID="start-selfie" label={taken ? t('ready.photos.selfieDone') : t('ready.photos.selfie')} ghost dark onPress={() => void selfie()} />
      ) : null}
    </View>
  );
};
