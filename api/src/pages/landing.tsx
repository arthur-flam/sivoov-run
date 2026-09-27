import type { Course, CourseTrack, DemoReel, DistanceKey, Race, RaceSeries } from '@sivoov/shared';
import { distanceLabel, formatKm, translator, windowPhase } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { CourseDiagram } from './courseDiagram';
import { fmtDate, fmtSpan } from './dates';
import { RaceRadio } from './raceRadio';

type Props = {
  race: Race;
  courses: Course[];
  track: CourseTrack | null;
  mapUrl: string | null;
  /** The main course's demo reel, when it has one: the page's « Écoutez la course ». */
  reel: DemoReel | null;
  locale: Locale;
  now: number;
};

/** Official distances are written the way runners know them: 42,195 km, 21,1 km, 10 km. */
const DIGITS: Record<DistanceKey, number> = { marathon: 3, half: 1, '10k': 0, '5k': 0 };

/** "3,9 km", "30 km": a landmark's place on the course. */
const landmarkKm = (meters: number, locale: Locale) => formatKm(meters, locale, 1).replace(/[.,]0 km$/, ' km');

const Series = ({ series, locale }: { series: RaceSeries; locale: Locale }) => {
  const t = translator(locale);
  const n = series.stages.findIndex((s) => s.current) + 1;
  return (
    <section class="section series" aria-labelledby="series-title">
      <div class="series-head">
        <h2 id="series-title">{series.name}</h2>
        {n > 0 ? <p class="series-stage">{t('series.stage', { n, total: series.stages.length })}</p> : null}
        <p>{t('series.lede')}</p>
      </div>
      <ol class="series-route">
        {series.stages.map((s) => (
          <li class={s.current ? 'is-current' : undefined}>
            <span class="series-dot" aria-hidden="true" />
            <span class="series-date">{fmtDate(`${s.date}T12:00:00Z`, locale, 'UTC', { day: 'numeric', month: 'long' })}</span>
            <strong>{s.name}</strong>
            <span class="series-place">{s.current ? t('series.here') : s.place}</span>
          </li>
        ))}
      </ol>
      {series.reward ? <p class="series-reward">{series.reward}</p> : null}
      {series.url ? (
        <p>
          <a class="series-link" href={series.url}>
            {t('series.more')}
          </a>
        </p>
      ) : null}
    </section>
  );
};

export const LandingPage = ({ race, courses, track, mapUrl, reel, locale, now }: Props) => {
  const t = translator(locale);
  const main = courses[0];
  const phase = windowPhase(race, now);
  const window = t('landing.window', fmtSpan(race.windowStart, race.windowEnd, locale, race.timezone));
  const cta = (
    <a class="btn btn-race" href={`/${race.slug}/signin`}>
      {t('landing.cta')}
    </a>
  );
  const gets = (['voice', 'time', 'medal', 'certificate'] as const).map((k) => ({ title: t(`landing.get.${k}.title`), body: t(`landing.get.${k}.body`) }));
  return (
    <div class="rl">
      <section class={race.theme.hero ? 'rl-hero has-photo' : 'rl-hero'} style={race.theme.hero ? `--hero:url('${race.theme.hero.replace(/'/g, '%27')}')` : undefined}>
        <div class="rl-hero-in">
          {race.theme.logo ? <img class="rl-logo" src={race.theme.logo} alt={race.theme.displayName} height={96} /> : null}
          <h1>{t('landing.tagline', { race: race.theme.displayName })}</h1>
          <p class="rl-lede">
            {t('landing.lede')} {t('landing.lede.audio')}
          </p>
          <div class="rl-actions">
            {cta}
            {reel ? (
              <a class="btn rl-listen" href="#ecouter" data-listen="">
                <span class="rl-listen-dot" aria-hidden="true" />
                {t('landing.listen')}
              </a>
            ) : null}
          </div>
          <p class="rl-window">
            <strong>{t('landing.eyebrow')}.</strong> {window}.
          </p>
        </div>
      </section>

      {reel && track && main ? <RaceRadio reel={reel} track={track} officialM={main.distanceM} courseId={main.id} locale={locale} /> : null}

      <section class="section" aria-labelledby="get-title">
        <h2 id="get-title">{t('landing.get.title')}</h2>
        <ul class="rl-gets">
          {gets.map((g) => (
            <li>
              <h3>{g.title}</h3>
              <p>{g.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {race.theme.series ? <Series series={race.theme.series} locale={locale} /> : null}

      {main && (mapUrl || track) ? (
        <section class="section" aria-labelledby="course-title">
          <h2 id="course-title">{t('landing.course.title')}</h2>
          <div class="rl-distances">
            {courses.map((c) => (
              <p>
                <span class="rl-dist">{formatKm(c.distanceM, locale, DIGITS[c.distanceKey])}</span> {distanceLabel(locale, c.distanceKey)}
              </p>
            ))}
          </div>
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
                    {l.description ? <span class="d"> {l.description}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section class="section" aria-labelledby="how-title">
        <h2 id="how-title">{t('landing.how.title')}</h2>
        <ol class="numbered">
          {([1, 2, 3] as const).map((n) => (
            <li>
              <span>
                <strong>{t(`landing.how.${n}.title`)}</strong>
                <br />
                <span class="rl-muted">{t(`landing.how.${n}.body`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section class="rl-final">
        <div>
          <h2>{t('landing.final.title')}</h2>
          <p>{t('landing.final.body')}</p>
        </div>
        <div class="rl-final-actions">
          {cta}
          {phase !== 'before' ? (
            <a class="rl-final-link" href={`/${race.slug}/results`}>
              {t('home.results')}
            </a>
          ) : null}
          {race.organizerUrl ? (
            <a class="rl-final-link" href={race.organizerUrl}>
              {t('landing.noBib')}
            </a>
          ) : null}
        </div>
      </section>
      {race.supportEmail ? (
        <p class="support">
          {t('landing.question')} <a href={`mailto:${race.supportEmail}`}>{race.supportEmail}</a>
        </p>
      ) : null}
    </div>
  );
};
