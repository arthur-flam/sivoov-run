import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import type { EntrantPublic, Race } from '@sivoov/shared';
import { Body, Button } from '@/components/ui';
import { t } from '@/i18n';
import { openCertificate, reportImageUrl, shareFinish } from '@/share';

type Props = { race: Race; entrant: Pick<EntrantPublic, 'bib' | 'distanceKey'>; elapsedMs: number; showReport: boolean; dark?: boolean };

/**
 * An official finish, ready to tell: the race report as it is shared (drawn by the Worker once
 * the result is in, so shown only when asked and hidden if it cannot be had), the share sheet,
 * and the page with the four pictures. The finish screen and the finisher's home both show it.
 */
export const FinisherShare = ({ race, entrant, elapsedMs, showReport, dark = false }: Props) => {
  const [reportShown, setReportShown] = useState(true);
  return (
    <>
      {showReport && reportShown ? (
        <Image
          testID="finish-report"
          source={{ uri: reportImageUrl(race, entrant.bib, 'post') }}
          style={styles.report}
          resizeMode="contain"
          accessibilityLabel={t('report.title')}
          onError={() => setReportShown(false)}
        />
      ) : null}
      <Button testID="share-finish" label={t('finish.share')} color={race.theme.primary} onColor={race.theme.onPrimary} onPress={() => void shareFinish(race, entrant, elapsedMs)} />
      <Button testID="open-certificate" label={t('finish.images')} ghost dark={dark} onPress={() => openCertificate(race, entrant.bib)} />
      <Body dark={dark} muted>
        {t('finish.images.hint')}
      </Body>
    </>
  );
};

const styles = StyleSheet.create({
  report: { width: '100%', aspectRatio: 1080 / 1350, borderRadius: 8 },
});
