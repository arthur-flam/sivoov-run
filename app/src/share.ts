import { Linking, Platform, Share } from 'react-native';
import { distanceLabel, formatOfficialTime } from '@sivoov/shared';
import type { EntrantPublic, Race } from '@sivoov/shared';
import { API_URL } from '@/api';
import { diag } from '@/diag';
import { locale, t } from '@/i18n';

/** The runner's certificate on the web: the page a shared link opens, with its preview card. */
export const resultUrl = (race: Pick<Race, 'slug'>, bib: string): string => `${API_URL}/${race.slug}/results/${bib}${locale === 'en' ? '?lang=en' : ''}`;

/**
 * The phone's share sheet with a sentence and the runner's page. The link's preview is the card
 * (api: /results/:bib/card.png), so the picture travels without a native module. Android shares
 * `message` only, so the link rides inside it; iOS takes the link apart for its preview.
 */
const shareLink = async (what: string, message: string, url: string): Promise<void> => {
  try {
    const result = await Share.share(Platform.OS === 'ios' ? { message: message.replace(url, '').trim(), url } : { message });
    diag('share', `${what} ${result.action}`);
  } catch (e) {
    diag('share', `${what} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const shareFinish = (race: Race, entrant: Pick<EntrantPublic, 'bib' | 'distanceKey'>, elapsedMs: number): Promise<void> => {
  const url = resultUrl(race, entrant.bib);
  return shareLink('finish', t('finish.shareMessage', { race: race.theme.displayName, distance: distanceLabel(locale, entrant.distanceKey), time: formatOfficialTime(elapsedMs), url }), url);
};

/**
 * Before the race: "I'm in, run it with me". Entries sell before race week, so this is the
 * share that can bring someone in; the link's preview is the bib card.
 */
export const shareBib = (race: Race, entrant: Pick<EntrantPublic, 'bib' | 'distanceKey'>): Promise<void> => {
  const url = resultUrl(race, entrant.bib);
  const day = (iso: string) => new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', timeZone: race.timezone }).format(new Date(iso));
  return shareLink('bib', t('share.bibMessage', { race: race.theme.displayName, distance: distanceLabel(locale, entrant.distanceKey), bib: entrant.bib, start: day(race.windowStart), end: day(race.windowEnd), url }), url);
};

export const openCertificate = (race: Pick<Race, 'slug'>, bib: string): void => {
  void Linking.openURL(resultUrl(race, bib)).catch(() => undefined);
};

export const openResults = (race: Pick<Race, 'slug'>): void => {
  void Linking.openURL(`${API_URL}/${race.slug}/results${locale === 'en' ? '?lang=en' : ''}`).catch(() => undefined);
};
