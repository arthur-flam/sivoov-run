import type { Course, Entrant, Race, Run } from '@sivoov/shared';
import { distanceLabel, formatOfficialTime, translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';
import { fmtDate } from './dates';

type Props = { race: Race; course: Course; courses: Course[]; rows: Array<{ run: Run; entrant: Entrant }>; locale: Locale };

export const ResultsPage = ({ race, course, courses, rows, locale }: Props) => {
  const t = translator(locale);
  return (
    <section class="section" style="border-bottom:0">
      <div class="eyebrow">{race.theme.displayName}</div>
      <h2>{t('home.results')} · {distanceLabel(locale, course.distanceKey)}</h2>
      <p style="margin-bottom:18px">
        {courses.map((c) => (
          <a class="btn btn-ghost" style={`margin:0 8px 8px 0;min-height:40px;${c.id === course.id ? 'border-color:var(--ink)' : ''}`} href={`/${race.slug}/results?distance=${c.distanceKey}`}>
            {distanceLabel(locale, c.distanceKey)}
          </a>
        ))}
      </p>
      {rows.length === 0 ? (
        <p class="empty">{locale === 'fr' ? 'Aucun résultat pour le moment. La fenêtre de course ouvre le ' : 'No results yet. The race window opens on '}{fmtDate(race.windowStart, locale, race.timezone)}.</p>
      ) : (
        <table class="results">
          <thead>
            <tr>
              <th>#</th>
              <th>{locale === 'fr' ? 'Dossard' : 'Bib'}</th>
              <th>{locale === 'fr' ? 'Coureur' : 'Runner'}</th>
              <th>{t('common.time')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ run, entrant }, i) => (
              <tr>
                <td class="num">{i + 1}</td>
                <td class="num">{entrant.bib}</td>
                <td>
                  {entrant.firstName} {entrant.lastName.toUpperCase()}
                  {run.status === 'uploaded' ? <span class="tag"> · {locale === 'fr' ? 'import' : 'upload'}</span> : null}
                </td>
                <td class="num">{formatOfficialTime(run.elapsedMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};
