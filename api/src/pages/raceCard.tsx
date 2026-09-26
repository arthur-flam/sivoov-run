import type { Course, CourseTrack, Race } from '@sivoov/shared';
import { distanceLabel, translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { CourseDiagram } from './courseDiagram';
import { fmtRaceDays, fmtSpan } from './dates';

/** What a race card needs: the course picture is the Mapbox PNG when there is one, else the diagram. */
export type RaceCardData = { race: Race; courses: Course[]; track: CourseTrack | null; mapUrl: string | null };

/** One open race on the home page, the whole card is the link. Wears the race's colors. */
export const RaceCard = ({ race, courses, track, mapUrl, locale }: RaceCardData & { locale: Locale }) => {
  const t = translator(locale);
  const main = courses[0];
  return (
    <a class="race-card" href={`/${race.slug}`} style={`--race-primary:${race.theme.primary};--race-on-primary:${race.theme.onPrimary}`}>
      <div class="race-card-body">
        <p class="race-card-kicker">
          {race.city} · {fmtRaceDays(race.dateStart, race.dateEnd, locale)}
        </p>
        <h3>{race.theme.displayName}</h3>
        <ul class="chips">
          {courses.map((c) => (
            <li>{distanceLabel(locale, c.distanceKey)}</li>
          ))}
        </ul>
        <p class="race-card-window">{t('site.card.window', fmtSpan(race.windowStart, race.windowEnd, locale, race.timezone))}</p>
        <span class="btn btn-race">{t('site.card.open')}</span>
      </div>
      {mapUrl ? (
        <div class="race-card-visual is-map">
          <img src={mapUrl} alt="" width={720} height={480} loading="lazy" />
        </div>
      ) : main && track ? (
        <div class="race-card-visual">
          <CourseDiagram track={track} officialM={main.distanceM} landmarks={main.landmarks} />
        </div>
      ) : null}
    </a>
  );
};
