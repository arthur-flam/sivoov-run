import type { CourseTrack, Locale, Race } from '@sivoov/shared';
import type { CardFormat } from '../lib/cards';
import { averagePace, distanceLabel, formatClock, formatOfficialTime, formatPace, formatRank, translator, windowPhase } from '@sivoov/shared';
import type { RunnerResult } from '../lib/results';
import { runDate, shortName } from '../lib/results';
import { CourseDiagram } from './courseDiagram';
import { fmtDate } from './dates';
import { resultClient } from './resultClient';

type Props = {
  race: Race;
  result: RunnerResult;
  track: CourseTrack | null;
  locale: Locale;
  now: number;
  /** The page's own absolute URL, which is what gets shared. */
  shareUrl: string;
  /** The pictures to share, first the link preview. None when the course has no file to draw. */
  cards: ShareOption[];
  /** The runner's race photos they chose to show. */
  photos: Array<{ url: string; title: string }>;
  /** Their photos page, when the one reading is the runner and the race has photo moments. */
  photosLink: string | null;
};

/**
 * One picture to share: its PNG when this deployment photographs cards, and always the card's
 * own page, which the preview shows in a frame when there is no PNG.
 */
export type ShareOption = { format: CardFormat; width: number; height: number; png: string | null; page: string };

/**
 * A runner's result: the certificate (it prints to a one-page PDF), the buttons to share it,
 * and for every visitor who is not that runner, the way into the race. This page is what a
 * shared link opens, so it is the product's front door as much as the landing page.
 */
export const ResultPage = ({ race, result, track, locale, now, shareUrl, cards, photos, photosLink }: Props) => {
  const t = translator(locale);
  const { entrant, course, best } = result;
  const open = windowPhase(race, now) !== 'after';
  const dates = { start: fmtDate(race.windowStart, locale, race.timezone), end: fmtDate(race.windowEnd, locale, race.timezone) };
  const distance = distanceLabel(locale, entrant.distanceKey);
  return (
    <>
      {best ? (
        <>
          <ShareStudio
            cards={cards}
            url={shareUrl}
            text={t('finish.shareMessage', { race: race.theme.displayName, distance, time: formatOfficialTime(best.run.elapsedMs), url: '' })}
            fileName={`${race.slug}-${entrant.bib}`}
            locale={locale}
          />
          <article class="certificate" aria-label={t('result.certificate')}>
            <div class="eyebrow">{t('result.certificate')}</div>
            <h1 class="cert-name">
              {entrant.firstName} <span>{entrant.lastName.toUpperCase()}</span>
            </h1>
            <p class="cert-crossed">{t('result.crossed')}</p>
            <p class="cert-race">{race.theme.displayName}</p>
            <p class="cert-distance">
              {distance} · {t('landing.eyebrow').toLowerCase()}
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

          <p class="result-actions">
            <button type="button" class="btn btn-ghost" data-print="">
              {t('result.print')}
            </button>
          </p>

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
      ) : open ? (
        <section class="result-pending">
          <div class="eyebrow">{race.theme.displayName}</div>
          <div class="bib" data-testid="bib-plate">
            {entrant.bib}
          </div>
          <h1>{t('result.bib.title', { firstName: entrant.firstName, race: race.theme.displayName })}</h1>
          <p>{t('result.bib.body', { firstName: entrant.firstName, distance, bib: entrant.bib, ...dates })}</p>
          <ShareActions
            url={shareUrl}
            text={t('share.bibMessage', { race: race.theme.displayName, distance, bib: entrant.bib, ...dates, url: '' })}
            cardUrl={cards.find((c) => c.format === 'post')?.png ?? null}
            fileName={`${race.slug}-${entrant.bib}.png`}
            locale={locale}
          />
        </section>
      ) : (
        <section class="result-pending">
          <div class="eyebrow">{race.theme.displayName}</div>
          <h1>{t('result.none.title', { firstName: entrant.firstName })}</h1>
          <p>{t('result.none.body', dates)}</p>
          <p class="hint">
            {shortName(entrant)} · {distance} · {t('result.bib')} {entrant.bib}
          </p>
        </section>
      )}

      {photosLink ? (
        <p class="result-actions">
          <a class="btn btn-ghost" href={photosLink}>
            {t('photos.cta')}
          </a>
        </p>
      ) : null}
      {photos.length > 0 ? (
        <section class="result-photos" aria-label={t('photos.gallery')}>
          <h2>{t('photos.gallery')}</h2>
          <ul>
            {photos.map((p) => (
              <li>
                <figure>
                  <img src={p.url} alt={t('photos.alt', { title: p.title })} loading="lazy" />
                  <figcaption>{p.title}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section class="result-cta">
        <h2>
          {best && open
            ? t('result.cta.finisher', { firstName: entrant.firstName })
            : !best && open
              ? t('result.bib.cta', { firstName: entrant.firstName })
              : t('result.cta.title', { race: race.theme.displayName })}
        </h2>
        <p>{open ? t('result.cta.body', dates) : t('landing.lede')}</p>
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

type StudioProps = { cards: ShareOption[]; url: string; text: string; fileName: string; locale: Locale };

const HINT = { og: 'share.hint.og', post: 'share.hint.post', story: 'share.hint.story', sticker: 'share.hint.sticker' } as const;
const LABEL = { og: 'share.format.og', post: 'share.format.post', story: 'share.format.story', sticker: 'share.format.sticker' } as const;

/**
 * The picture a finisher shares, shown big, the very one under their link: the race report
 * (the link preview), the feed post, the story, and the transparent sticker. Picking one swaps
 * the picture and what « Partager l'image » and « Télécharger » hand over.
 */
const ShareStudio = ({ cards, url, text, fileName, locale }: StudioProps) => {
  const t = translator(locale);
  const first = cards[0];
  return (
    <section class="share-studio" aria-label={t('share.pick')} data-share-studio="">
      {first ? (
        <>
          <div class={`share-stage fmt-${first.format}`} data-stage="" style={`aspect-ratio:${first.width}/${first.height}`}>
            {first.png ? (
              <img data-card-img="" src={first.png} width={first.width} height={first.height} alt={t('report.title')} />
            ) : (
              <iframe data-card-frame="" src={first.page} width={first.width} height={first.height} title={t('report.title')} loading="lazy" tabindex={-1} />
            )}
          </div>
          {cards.length > 1 ? (
            <div class="share-formats" role="radiogroup" aria-label={t('share.pick')}>
              {cards.map((c, i) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={i === 0 ? 'true' : 'false'}
                  data-format={c.format}
                  data-png={c.png ?? ''}
                  data-page={c.page}
                  data-w={String(c.width)}
                  data-h={String(c.height)}
                  data-hint={t(HINT[c.format])}
                >
                  {t(LABEL[c.format])}
                </button>
              ))}
            </div>
          ) : null}
          <p class="share-hint" data-hint="">
            {t(HINT[first.format])}
          </p>
        </>
      ) : null}
      <div class="result-actions">
        <button type="button" class="btn btn-race" data-share="" data-url={url} data-text={text.trim()} data-card={first?.png ?? ''} data-file={fileName} data-copied={t('result.copied')}>
          {first?.png ? t('share.shareImage') : t('result.share')}
        </button>
        {first?.png ? (
          <a class="btn btn-ghost" href={first.png} download={`${fileName}-${first.format}.png`} data-download="">
            {t('result.download')}
          </a>
        ) : null}
        <button type="button" class="btn btn-ghost" data-copy="" data-url={url} data-copied={t('result.copied')}>
          {t('share.copyLink')}
        </button>
      </div>
    </section>
  );
};

type ShareProps = { url: string; text: string; cardUrl: string | null; fileName: string; locale: Locale };

/** Before the finish: share the bib card (as an image where the browser can share files), download it. */
const ShareActions = ({ url, text, cardUrl, fileName, locale }: ShareProps) => {
  const t = translator(locale);
  return (
    <div class="result-actions">
      <button type="button" class="btn btn-race" data-share="" data-url={url} data-text={text.trim()} data-card={cardUrl ?? ''} data-copied={t('result.copied')}>
        {t('result.share')}
      </button>
      {cardUrl ? (
        <a class="btn btn-ghost" href={cardUrl} download={fileName}>
          {t('result.download')}
        </a>
      ) : null}
    </div>
  );
};
