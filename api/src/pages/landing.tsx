import type { Course, CourseTrack, Race } from '@sivoov/shared';
import { distanceLabel, translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { CourseDiagram } from './courseDiagram';
import { fmtDate } from './dates';

type Props = { race: Race; courses: Course[]; track: CourseTrack | null; locale: Locale };

export const LandingPage = ({ race, courses, track, locale }: Props) => {
  const t = translator(locale);
  const main = courses[0];
  const windowDays = Math.round((new Date(race.windowEnd).getTime() - new Date(race.windowStart).getTime()) / 86_400_000);
  return (
    <>
      <section class="hero">
        <div class="eyebrow">{t('landing.eyebrow')}</div>
        <h1>
          {locale === 'fr' ? 'Courez ' : 'Run '}
          <em>{race.theme.displayName}</em>
          {locale === 'fr' ? ' où que vous soyez.' : ' wherever you are.'}
        </h1>
        <p class="lede">{t('landing.lede')}</p>
        <div class="cta-row">
          <a class="btn btn-race" href={`/${race.slug}/signin`}>
            {t('landing.cta')}
          </a>
          <span class="window">{t('landing.window', { start: fmtDate(race.windowStart, locale, race.timezone), end: fmtDate(race.windowEnd, locale, race.timezone) })}</span>
        </div>
      </section>

      <section class="facts" aria-label={t('landing.distances')}>
        {courses.map((c) => (
          <div class="fact">
            <div class="k">{distanceLabel(locale, c.distanceKey)}</div>
            <div class="v">{(c.distanceM / 1000).toFixed(c.distanceKey === 'half' ? 1 : c.distanceKey === 'marathon' ? 3 : 0).replace('.', locale === 'fr' ? ',' : '.')} km</div>
            <div class="s">{c.landmarks.length} {locale === 'fr' ? 'lieux racontés' : 'narrated landmarks'}</div>
          </div>
        ))}
        <div class="fact">
          <div class="k">{locale === 'fr' ? 'Fenêtre' : 'Window'}</div>
          <div class="v">{windowDays}</div>
          <div class="s">{locale === 'fr' ? 'jours pour courir votre vague' : 'days to run your wave'}</div>
        </div>
      </section>

      <section class="section">
        <h2>{t('landing.how.title')}</h2>
        <div class="steps">
          {([1, 2, 3, 4] as const).map((n) => (
            <div class="step">
              <h3>{t(`landing.how.${n}.title`)}</h3>
              <p>{t(`landing.how.${n}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section class="section">
        <h2>{t('landing.what.title')}</h2>
        <ul class="what">
          <li>{t('landing.what.ceremony')}</li>
          <li>{t('landing.what.course')}</li>
          <li>{t('landing.what.results')}</li>
          <li>{t('landing.what.medal')}</li>
        </ul>
      </section>

      {main && track ? (
        <section class="section">
          <h2>{locale === 'fr' ? 'Le parcours' : 'The course'}</h2>
          <div class="course">
            <div class="diagram">
              <CourseDiagram track={track} officialM={main.distanceM} landmarks={main.landmarks} />
            </div>
            <ul class="landmarks">
              {main.landmarks.map((l) => (
                <li>
                  <span class="km">{l.meters === 0 ? (locale === 'fr' ? 'Départ' : 'Start') : `km ${(l.meters / 1000).toFixed(1).replace('.0', '')}`}</span>
                  <span>
                    <strong>{l.name}</strong>
                    {l.description ? <span class="d"> · {l.description}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section class="section" style="border-bottom:0">
        <div class="cta-row">
          <a class="btn btn-race" href={`/${race.slug}/signin`}>
            {t('landing.cta')}
          </a>
          {race.organizerUrl ? (
            <a class="window" href={race.organizerUrl}>
              {t('landing.organizer', { organizer: race.name })}
            </a>
          ) : null}
        </div>
      </section>
    </>
  );
};
