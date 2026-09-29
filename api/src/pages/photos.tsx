import type { CourseMoment, Entrant, Locale, Race, RunnerPhoto } from '@sivoov/shared';
import { MAX_PHOTO_ATTEMPTS, formatPlaceKm, translator } from '@sivoov/shared';
import type { SelfieRefusal } from '../lib/photos';
import { photosClient } from './photosClient';

/** What went wrong, said on the page: a selfie refused (lib/photos.ts), or a picture that could not be made. */
export type PhotoProblem = { reason: SelfieRefusal | 'failed'; momentId?: string };

type Moment = CourseMoment & { place?: string };
type Photo = RunnerPhoto & { url?: string; again: boolean };

type Props = { race: Race; entrant: Entrant; officialM: number; locale: Locale; enabled: boolean; moments: Moment[]; photos: Photo[]; problem?: PhotoProblem };

const where = (m: Moment, officialM: number, locale: Locale): string => {
  const t = translator(locale);
  if (m.meters <= 0) return t('photos.at.start');
  if (m.meters >= officialM) return t('photos.at.finish');
  return `km ${formatPlaceKm(m.meters, locale).replace(/ km$/, '')}`;
};

/** The form that sends a selfie for a moment: the photo, the agreement, one button. */
const SendForm = ({ race, moment, locale, again }: { race: Race; moment: Moment; locale: Locale; again: boolean }) => {
  const t = translator(locale);
  return (
    <form class="photo-form" method="post" action={`/${race.slug}/photos/${moment.id}`} enctype="multipart/form-data" data-photo-form="" data-wait={t('photos.wait')}>
      <label class="field">
        <span>{again ? t('photos.another') : t('photos.yours')}</span>
        <input type="file" name="photo" accept="image/*" required />
      </label>
      <label class="consent">
        <input type="checkbox" name="consent" required />
        <span>{t('photos.consent')}</span>
      </label>
      <button type="submit" class="btn btn-race">
        {t('photos.send')}
      </button>
    </form>
  );
};

/**
 * `/{race}/photos`: each photo moment of the runner's course, what the organizer asks for, the
 * place as it looks, and the runner's picture once made: download, share, show it on their page,
 * try again, delete. Nothing here is public unless the runner shows it.
 */
export const PhotosPage = ({ race, entrant, officialM, locale, enabled, moments, photos, problem }: Props) => {
  const t = translator(locale);
  const byMoment = new Map(photos.map((p) => [p.momentId, p]));
  return (
    <section class="photos-page">
      <div class="eyebrow">{race.theme.displayName}</div>
      <h1>{t('photos.title')}</h1>
      <p class="lede">{t('photos.lede', { bib: entrant.bib })}</p>
      {!enabled ? <p class="error">{t('photos.unavailable')}</p> : null}
      {problem && !problem.momentId ? <p class="error" role="alert">{t(`photos.problem.${problem.reason}`)}</p> : null}
      {moments.length === 0 ? <p class="empty">{t('photos.none')}</p> : null}
      <ol class="moments">
        {moments.map((m) => {
          const photo = byMoment.get(m.id);
          const left = photo ? MAX_PHOTO_ATTEMPTS - photo.attempts : MAX_PHOTO_ATTEMPTS;
          return (
            <li class="moment" id={`m-${m.id}`} data-testid={`moment-${m.id}`}>
              <div class="moment-head">
                <span class="moment-where">{where(m, officialM, locale)}</span>
                <h2>{m.title}</h2>
                <p>{m.ask}</p>
              </div>
              {problem?.momentId === m.id ? (
                <p class="error" role="alert">
                  {t(`photos.problem.${problem.reason}`)}
                </p>
              ) : null}
              {photo?.url ? (
                <figure class="moment-photo">
                  <img src={photo.url} alt={t('photos.alt', { title: m.title })} data-testid="runner-photo" />
                  <figcaption class="photo-actions">
                    <a class="btn btn-ghost" href={photo.url} download={`${race.slug}-${entrant.bib}-${m.id}.png`}>
                      {t('result.download')}
                    </a>
                    <button type="button" class="btn btn-ghost" data-share-photo={photo.url} data-title={`${race.theme.displayName} · ${m.title}`}>
                      {t('result.share')}
                    </button>
                    <form method="post" action={`/${race.slug}/photos/${photo.id}/shown`}>
                      <input type="hidden" name="shown" value={photo.shown ? '0' : '1'} />
                      <button type="submit" class="btn btn-ghost" aria-pressed={photo.shown ? 'true' : 'false'}>
                        {photo.shown ? t('photos.hide') : t('photos.show')}
                      </button>
                    </form>
                  </figcaption>
                  <p class="hint">{photo.shown ? t('photos.shown') : t('photos.private')}</p>
                </figure>
              ) : photo?.status === 'waiting' ? (
                <div class="moment-waiting" data-testid="photo-waiting">
                  <p>{t('photos.waiting')}</p>
                  <form method="post" action={`/${race.slug}/photos/${photo.id}/again`} data-photo-form="" data-wait={t('photos.wait')}>
                    <button type="submit" class="btn btn-race" disabled={!enabled}>
                      {t('photos.makeNow')}
                    </button>
                  </form>
                </div>
              ) : m.place ? (
                <figure class="moment-place">
                  <img src={m.place} alt={t('photos.place', { title: m.title })} loading="lazy" />
                </figure>
              ) : null}
              {enabled && (!photo || photo.again) ? (
                <>
                  {photo?.url && photo.status !== 'waiting' ? (
                    <form method="post" action={`/${race.slug}/photos/${photo.id}/again`} data-photo-form="" data-wait={t('photos.wait')} class="photo-again">
                      <button type="submit" class="btn btn-ghost">
                        {t('photos.again', { n: left })}
                      </button>
                    </form>
                  ) : null}
                  {photo ? (
                    <details class="photo-another">
                      <summary>{t('photos.another')}</summary>
                      <SendForm race={race} moment={m} locale={locale} again />
                    </details>
                  ) : (
                    <SendForm race={race} moment={m} locale={locale} again={false} />
                  )}
                </>
              ) : null}
              {photo ? (
                <form method="post" action={`/${race.slug}/photos/${photo.id}/delete`} class="photo-delete">
                  <button type="submit" class="link-button">
                    {t('photos.delete')}
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p class="hint">{t('photos.privacy')}</p>
      <p class="cta-row">
        <a href={`/${race.slug}/results/${entrant.bib}`}>{t('photos.toResult')}</a>
      </p>
      <script dangerouslySetInnerHTML={{ __html: photosClient }} />
    </section>
  );
};
