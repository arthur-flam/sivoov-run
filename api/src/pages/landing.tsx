import type { Course, CourseTrack, DistanceKey, Race } from '@sivoov/shared';
import { distanceLabel, formatKm, translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { CourseDiagram } from './courseDiagram';
import { fmtSpan } from './dates';

type Props = { race: Race; courses: Course[]; track: CourseTrack | null; mapUrl: string | null; locale: Locale };

/** Official distances are written the way runners know them: 42,195 km, 21,1 km, 10 km. */
const DIGITS: Record<DistanceKey, number> = { marathon: 3, half: 1, '10k': 0, '5k': 0 };

/** "3,9 km", "30 km": a landmark's place on the course. */
const landmarkKm = (meters: number, locale: Locale) => formatKm(meters, locale, 1).replace(/[.,]0 km$/, ' km');

export const LandingPage = ({ race, courses, track, mapUrl, locale }: Props) => {
  const t = translator(locale);
  const main = courses[0];
  const [before, after] = t('landing.tagline').split('{race}');
  const cta = (
    <a class="btn btn-race" href={`/${race.slug}/signin`}>
      {t('landing.cta')}
    </a>
  );
  return (
    <>
      {race.theme.hero ? <img class="race-banner" src={race.theme.hero} alt="" width={1040} height={360} /> : null}
      <section class="hero">
        {race.theme.logo ? <img class="race-logo" src={race.theme.logo} alt={race.theme.displayName} height={56} /> : null}
        <div class="eyebrow">{t('landing.eyebrow')}</div>
        <h1>
          {before}
          <em>{race.theme.displayName}</em>
          {after}
        </h1>
        <p class="lede">{t('landing.lede')}</p>
        <ul class="what" aria-label={t('landing.what.title')}>
          <li>{t('landing.what.ceremony')}</li>
          <li>{t('landing.what.course')}</li>
          <li>{t('landing.what.results')}</li>
          <li>{t('landing.what.medal')}</li>
        </ul>
        <div class="cta-row">
          {cta}
          <span class="window">{t('landing.window', fmtSpan(race.windowStart, race.windowEnd, locale, race.timezone))}</span>
        </div>
      </section>

      <section class="facts" aria-label={t('landing.distances')}>
        {courses.map((c) => (
          <div class="fact">
            <div class="k">{distanceLabel(locale, c.distanceKey)}</div>
            <div class="v">{formatKm(c.distanceM, locale, DIGITS[c.distanceKey])}</div>
            <div class="s">{t('landing.landmarks', { count: c.landmarks.length })}</div>
          </div>
        ))}
      </section>

      <section class="section">
        <h2>{t('landing.how.title')}</h2>
        <div class="steps">
          {([1, 2, 3] as const).map((n) => (
            <div class="step">
              <h3>{t(`landing.how.${n}.title`)}</h3>
              <p>{t(`landing.how.${n}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      {main && (mapUrl || track) ? (
        <section class="section">
          <h2>{t('landing.course.title')}</h2>
          <div class="course">
            {mapUrl ? (
              <img class="course-map" src={mapUrl} alt={t('landing.course.map')} width={720} height={400} loading="lazy" />
            ) : track ? (
              <div class="diagram">
                <CourseDiagram track={track} officialM={main.distanceM} landmarks={main.landmarks} />
              </div>
            ) : null}
            <ul class="landmarks">
              {main.landmarks.map((l) => (
                <li>
                  <span class="km">{l.meters === 0 ? t('landing.course.start') : landmarkKm(l.meters, locale)}</span>
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

      <section class="section landing-end">
        <div class="cta-row">
          {cta}
          {race.organizerUrl ? (
            <a class="window" href={race.organizerUrl}>
              {t('landing.organizer', { organizer: race.name })}
            </a>
          ) : null}
        </div>
        {race.supportEmail ? (
          <p class="support">
            {t('landing.question')} <a href={`mailto:${race.supportEmail}`}>{race.supportEmail}</a>
          </p>
        ) : null}
      </section>
    </>
  );
};
