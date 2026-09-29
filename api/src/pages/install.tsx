import type { Entrant, Race } from '@sivoov/shared';
import { distanceLabel, translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { fmtSpan } from './dates';

/** Where the app can be had today: the stores, or the TestFlight and Play testing links during the beta. */
export type AppLinks = { ios?: string; android?: string };

type Props = { race: Race; entrant: Entrant; locale: Locale; links: AppLinks };

/** A TestFlight public link is not the App Store: the button says so, so an iPhone owner knows to expect TestFlight. */
const isTestFlight = (url: string): boolean => /^https:\/\/testflight\.apple\.com\//.test(url);

/** After sign-in on the web: your bib, and where to get the app. */
export const InstallPage = ({ race, entrant, locale, links }: Props) => {
  const t = translator(locale);
  return (
    <section class="welcome">
      <div class="eyebrow">{race.theme.displayName}</div>
      <h1 style="font-family:var(--font-display);font-weight:500;font-size:34px">{t('signin.welcome', { firstName: entrant.firstName })}</h1>
      <div class="bib">{entrant.bib}</div>
      <p style="color:var(--ink-2)">
        {distanceLabel(locale, entrant.distanceKey)} · {t('install.window', fmtSpan(race.windowStart, race.windowEnd, locale, race.timezone))}
      </p>
      <p style="margin-top:24px;max-width:46ch;margin-left:auto;margin-right:auto">{t('install.lede')}</p>
      {links.ios || links.android ? (
        <div class="stores">
          {links.ios ? (
            <a class="btn btn-ghost" href={links.ios} rel="noopener">
              {t(isTestFlight(links.ios) ? 'install.testFlight' : 'install.appStore')}
            </a>
          ) : null}
          {links.android ? (
            <a class="btn btn-ghost" href={links.android} rel="noopener">
              {t('install.googlePlay')}
            </a>
          ) : null}
        </div>
      ) : (
        <p class="hint">{t('install.soon')}</p>
      )}
      <p style="margin-top:22px;font-size:15px;color:var(--ink-2)">
        <a href={`/${race.slug}/upload`}>{t('upload.installLink')}</a>
      </p>
      <p class="hint" style="margin-top:30px">
        <a href={`/${race.slug}/results`}>{t('home.results')}</a> · <a href={`/${race.slug}/signout`}>{t('home.signout')}</a>
      </p>
    </section>
  );
};
