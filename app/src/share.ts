import { Linking, Platform, Share } from 'react-native';
import { distanceLabel, formatOfficialTime } from '@sivoov/shared';
import type { EntrantPublic, Race } from '@sivoov/shared';
import { API_URL } from '@/api';
import { diag } from '@/diag';
import { locale, t } from '@/i18n';

/** The runner's certificate on the web: the page a shared link opens, with its preview card. */
export const resultUrl = (race: Pick<Race, 'slug'>, bib: string): string => `${API_URL}/${race.slug}/results/${bib}${locale === 'en' ? '?lang=en' : ''}`;

/**
 * The phone's share sheet with a sentence and the certificate link. The link's preview is the
 * finisher card (api: /results/:bib/card.png), so the picture travels without a native module.
 * Android shares `message` only, so the link rides inside it.
 */
export const shareFinish = async (race: Race, entrant: Pick<EntrantPublic, 'bib' | 'distanceKey'>, elapsedMs: number): Promise<void> => {
  const url = resultUrl(race, entrant.bib);
  const message = t('finish.shareMessage', { race: race.theme.displayName, distance: distanceLabel(locale, entrant.distanceKey), time: formatOfficialTime(elapsedMs), url });
  try {
    const result = await Share.share(Platform.OS === 'ios' ? { message: message.replace(url, '').trim(), url } : { message });
    diag('share', `finish ${result.action}`);
  } catch (e) {
    diag('share', `failed: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const openCertificate = (race: Pick<Race, 'slug'>, bib: string): void => {
  void Linking.openURL(resultUrl(race, bib)).catch(() => undefined);
};

export const openResults = (race: Pick<Race, 'slug'>): void => {
  void Linking.openURL(`${API_URL}/${race.slug}/results${locale === 'en' ? '?lang=en' : ''}`).catch(() => undefined);
};
