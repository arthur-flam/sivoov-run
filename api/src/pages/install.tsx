import type { Entrant, Race } from '@sivoov/shared';
import { distanceLabel, translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { fmtDate } from './dates';

type Props = { race: Race; entrant: Entrant; locale: Locale };

/** After sign-in on the web: your bib, and where to get the app. */
export const InstallPage = ({ race, entrant, locale }: Props) => {
  const t = translator(locale);
  return (
    <section class="welcome">
      <div class="eyebrow">{race.theme.displayName}</div>
      <h1 style="font-family:var(--font-display);font-weight:500;font-size:34px">{t('signin.welcome', { firstName: entrant.firstName })}</h1>
      <div class="bib">{entrant.bib}</div>
      <p style="color:var(--ink-2)">
        {distanceLabel(locale, entrant.distanceKey)} · {t('home.window')}: {fmtDate(race.windowStart, locale, race.timezone)} → {fmtDate(race.windowEnd, locale, race.timezone)}
      </p>
      <p style="margin-top:24px;max-width:46ch;margin-left:auto;margin-right:auto">
        {locale === 'fr'
          ? 'Installez l’app Sivoov et connectez-vous avec le même dossard et le même email. La course se court dans l’app, la suite se passe ici.'
          : 'Install the Sivoov app and sign in with the same bib and email. The race is run in the app; everything else happens here.'}
      </p>
      <div class="stores">
        <a class="btn btn-ghost" href="https://apps.apple.com/app/sivoov" rel="noopener">App Store</a>
        <a class="btn btn-ghost" href="https://play.google.com/store/apps/details?id=com.arthur.flam.sivoov" rel="noopener">Google Play</a>
      </div>
      <p class="hint" style="margin-top:30px">
        <a href={`/${race.slug}/results`}>{t('home.results')}</a> · <a href={`/${race.slug}/signout`}>{t('home.signout')}</a>
      </p>
    </section>
  );
};
