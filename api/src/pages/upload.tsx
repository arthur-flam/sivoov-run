import type { Course, Entrant, Locale, Race, UploadRefusal } from '@sivoov/shared';
import { distanceLabel, formatClock, formatKm, formatOfficialTime, translator } from '@sivoov/shared';
import { fmtDate } from './dates';

/** What can go wrong with an upload: the file never reached the tracker, or the tracker refused it. */
export type UploadProblem = { reason: 'no_file' } | { reason: 'too_large' } | UploadRefusal;

type Props = { race: Race; entrant: Entrant; course: Course; locale: Locale; problem?: UploadProblem };

/** The refusals whose message sends the runner to the organizer: the page adds where to find them. */
const TO_ORGANIZER: ReadonlySet<UploadProblem['reason']> = new Set(['no_position', 'too_short']);

const ProblemMessage = ({ race, course, locale, problem }: Required<Omit<Props, 'entrant'>>) => {
  const t = translator(locale);
  const day = (iso: string) => fmtDate(iso, locale, race.timezone);
  const window = { start: day(race.windowStart), end: day(race.windowEnd) };
  const courseKm = formatKm(course.distanceM, locale, 1);
  switch (problem.reason) {
    case 'before_window':
    case 'after_window': {
      const startedAt = fmtDate(problem.startedAt, locale, race.timezone, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      return <>{t(`upload.problem.${problem.reason}`, { startedAt, ...window })}</>;
    }
    case 'too_short': {
      const missingM = course.distanceM - problem.distanceM;
      const missing = missingM < 1000 ? `${Math.ceil(missingM)} m` : formatKm(missingM, locale);
      return <>{t('upload.problem.too_short', { measured: formatKm(problem.distanceM, locale), distance: courseKm, missing })}</>;
    }
    case 'faster_than_record':
      return <>{t('upload.problem.faster_than_record', { time: formatOfficialTime(problem.elapsedMs), distance: courseKm })}</>;
    case 'fast_kilometre':
      return <>{t('upload.problem.fast_kilometre', { km: problem.km, split: formatClock(problem.splitMs) })}</>;
    default:
      return <>{t(`upload.problem.${problem.reason}`)}</>;
  }
};

/** The GPX fallback: one file, one button, and what the file has to be. */
export const UploadPage = ({ race, entrant, course, locale, problem }: Props) => {
  const t = translator(locale);
  const day = (iso: string) => fmtDate(iso, locale, race.timezone);
  return (
    <section class="form-page">
      <a class="race-chip" href={`/${race.slug}`}>
        <i></i>
        {race.theme.displayName}
      </a>
      <h1>{t('upload.title')}</h1>
      <p>{t('upload.lede')}</p>
      {problem ? (
        <div class="error" role="alert">
          <ProblemMessage race={race} course={course} locale={locale} problem={problem} />
          {TO_ORGANIZER.has(problem.reason) && race.organizerUrl ? (
            <p class="upload-contact">
              <a href={race.organizerUrl} rel="noopener">{new URL(race.organizerUrl).host}</a>
            </p>
          ) : null}
        </div>
      ) : null}
      <form method="post" action={`/${race.slug}/upload`} enctype="multipart/form-data">
        <div class="field">
          <label for="gpx">{t('upload.file')}</label>
          {/* No `accept` filter: iOS greys out files whose extension it has no type for, and a
              runner who cannot pick the file has no way round it. The server says what is wrong. */}
          <input id="gpx" name="gpx" type="file" class="upload-file" required />
          <span class="upload-hint">{t('upload.fileHint')}</span>
        </div>
        <button class="btn btn-race" type="submit" style="width:100%">
          {t('upload.send')}
        </button>
      </form>
      <h2 class="upload-accepted">{t('upload.accepted.title')}</h2>
      <ul class="what">
        <li>{t('upload.accepted.sources')}</li>
        <li>{t('upload.accepted.window', { start: day(race.windowStart), end: day(race.windowEnd) })}</li>
        <li>{t('upload.accepted.distance', { distance: formatKm(course.distanceM, locale, 1) })}</li>
      </ul>
      <p class="hint">
        {t('upload.entry', { bib: entrant.bib, distance: distanceLabel(locale, entrant.distanceKey) })} ·{' '}
        <a href={`/${race.slug}/app`}>{t('common.back')}</a>
      </p>
    </section>
  );
};
