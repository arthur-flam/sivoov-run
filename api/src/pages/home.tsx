import { translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { ORGANIZERS_PATH } from './layout';
import { RaceCard } from './raceCard';
import type { RaceCardData } from './raceCard';

const HOW = ['site.how.1', 'site.how.2', 'site.how.3'] as const;

/** The way in for race directors, at the foot of the runners' page. */
const OrganizerBand = ({ locale }: { locale: Locale }) => {
  const t = translator(locale);
  return (
    <section class="band">
      <div>
        <h2>{t('site.organizers.title')}</h2>
        <p>{t('site.organizers.body')}</p>
      </div>
      <a class="btn btn-light" href={ORGANIZERS_PATH}>
        {t('site.organizers.cta')}
      </a>
    </section>
  );
};

/** run.sivoov.app root: one line, the open races, how it works, and the door for organizers. */
export const HomePage = ({ cards, locale }: { cards: RaceCardData[]; locale: Locale }) => {
  const t = translator(locale);
  return (
    <>
      <section class="home-hero">
        <h1>{t('site.home.title')}</h1>
        <p class="lede">{t('site.home.lede')}</p>
      </section>
      <section class="home-races" aria-labelledby="open-races">
        <h2 class="kicker" id="open-races">
          {t('site.home.races')}
        </h2>
        {cards.length === 0 ? (
          <p class="empty">{t('site.home.none')}</p>
        ) : (
          <div class="race-cards">
            {cards.map((card) => (
              <RaceCard {...card} locale={locale} />
            ))}
          </div>
        )}
      </section>
      <section class="section home-how">
        <h2>{t('landing.how.title')}</h2>
        <ol class="numbered">
          {HOW.map((key) => (
            <li>{t(key)}</li>
          ))}
        </ol>
      </section>
      <OrganizerBand locale={locale} />
    </>
  );
};
