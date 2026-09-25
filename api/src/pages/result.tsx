import type { CourseTrack, Locale, Race } from '@sivoov/shared';
import { averagePace, distanceLabel, formatClock, formatOfficialTime, formatPace, formatRank, translator } from '@sivoov/shared';
import type { RunnerResult } from '../lib/results';
import { fullName, runDate } from '../lib/results';
import { CourseDiagram } from './courseDiagram';
import { fmtDate } from './dates';
import { resultClient } from './resultClient';

type Props = {
  race: Race;
  result: RunnerResult;
  track: CourseTrack | null;
  locale: Locale;
  /** The page's own absolute URL, which is what gets shared. */
  shareUrl: string;
  /** The portrait card as PNG, when cards are rendered on this deployment. */
  storyCardUrl: string | null;
};

/**
 * A runner's result: the certificate (it prints to a one-page PDF), the buttons to share it,
 * and for every visitor who is not that runner, the way into the race. This page is what a
 * shared link opens, so it is the product's front door as much as the landing page.
 */
export const ResultPage = ({ race, result, track, locale, shareUrl, storyCardUrl }: Props) => {
  const t = translator(locale);
  const { entrant, course, best } = result;
  return (
    <>
      {best ? (
        <>
          <article class="certificate" aria-label={t('result.certificate')}>
            <div class="cert-band" />
            <div class="eyebrow">{t('result.certificate')}</div>
            <h1 class="cert-name">
              {entrant.firstName} <span>{entrant.lastName.toUpperCase()}</span>
            </h1>
            <p class="cert-crossed">{t('result.crossed')}</p>
            <p class="cert-race">{race.theme.displayName}</p>
            <p class="cert-distance">
              {distanceLabel(locale, entrant.distanceKey)} · {t('landing.eyebrow').toLowerCase()}
            </p>
            <div class="cert-time" data-testid="result-time">
              {formatOfficialTime(best.run.elapsedMs)}
            </div>
            <dl class="cert-facts">
              <div>
                <dt>{t('result.rank')}</dt>
                <dd>{t('result.rankOf', { rank: formatRank(best.rank, locale), total: best.total })}</dd>
              </div>
              <div>
                <dt>{t('common.pace')}</dt>
                <dd>{formatPace(averagePace(best.run.elapsedMs, course.distanceM))} /km</dd>
              </div>
              <div>
                <dt>{t('result.bib')}</dt>
                <dd>{entrant.bib}</dd>
              </div>
              <div>
                <dt>{t('result.date')}</dt>
                <dd>{runDate(race, best.run, locale)}</dd>
              </div>
            </dl>
            {track ? (
              <div class="cert-course" aria-hidden="true">
                <CourseDiagram track={track} officialM={course.distanceM} landmarks={[]} width={240} height={180} />
              </div>
            ) : null}
            <p class="cert-foot">
              <span>{best.run.source === 'upload' ? t('result.source.upload') : t('result.source.app')}</span>
              <span>Sivoov Run</span>
            </p>
          </article>

          <div class="result-actions">
            <button
              type="button"
              class="btn btn-race"
              data-share=""
              data-url={shareUrl}
              data-text={t('finish.shareMessage', { race: race.theme.displayName, distance: distanceLabel(locale, entrant.distanceKey), time: formatOfficialTime(best.run.elapsedMs), url: '' }).trim()}
              data-card={storyCardUrl ?? ''}
              data-copied={t('result.copied')}
            >
              {t('result.share')}
            </button>
            {storyCardUrl ? (
              <a class="btn btn-ghost" href={storyCardUrl} download={`${race.slug}-${entrant.bib}.png`}>
                {t('result.download')}
              </a>
            ) : null}
            <button type="button" class="btn btn-ghost" data-print="">
              {t('result.print')}
            </button>
          </div>

          {best.run.splits.length > 0 ? (
            <details class="result-splits">
              <summary>
                {t('run.finished.splits')} · {best.run.splits.length} km
              </summary>
              <ol>
                {best.run.splits.map((s) => (
                  <li>
                    <span class="km">km {s.km}</span>
                    <span class="num">{formatClock(s.splitMs)}</span>
                    <span class="num muted">{formatClock(s.elapsedMs)}</span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </>
      ) : (
        <section class="result-pending">
          <div class="eyebrow">{race.theme.displayName}</div>
          <h1>{t('result.pending.title', { firstName: entrant.firstName })}</h1>
          <p>
            {t('result.pending.body', {
              start: fmtDate(race.windowStart, locale, race.timezone),
              end: fmtDate(race.windowEnd, locale, race.timezone),
            })}
          </p>
          <p class="hint">
            {fullName(entrant)} · {distanceLabel(locale, entrant.distanceKey)} · {t('result.bib')} {entrant.bib}
          </p>
        </section>
      )}

      <section class="result-cta">
        <h2>{t('result.cta.title', { race: race.theme.displayName })}</h2>
        <p>{t('landing.lede')}</p>
        <p class="cta-row">
          <a class="btn btn-race" href={`/${race.slug}`}>
            {t('result.cta.button')}
          </a>
          <a href={`/${race.slug}/results?distance=${entrant.distanceKey}`}>{t('result.all')}</a>
        </p>
      </section>
      <script dangerouslySetInnerHTML={{ __html: resultClient }} />
    </>
  );
};
