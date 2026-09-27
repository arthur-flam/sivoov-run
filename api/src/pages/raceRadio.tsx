import type { CourseTrack, DemoReel, Locale } from '@sivoov/shared';
import { formatKm, toDiagram, translator } from '@sivoov/shared';
import radioSource from './raceRadio.client.js';

type Props = { reel: DemoReel; track: CourseTrack; officialM: number; courseId: string; locale: Locale };

const W = 520;
const H = 400;

/** "4:32" for the chapter list. */
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * « Écoutez la course »: the course's demo reel (one produced MP3, `npm run produce`) played
 * over the real course. The runner's dot moves along the trace chapter by chapter, the race
 * clock runs from the gun (the countdown's digits before it), and the speaker's words show as
 * subtitles. Without JavaScript it is a plain audio player and a list of moments.
 */
export const RaceRadio = ({ reel, track, officialM, courseId, locale }: Props) => {
  const t = translator(locale);
  const { points } = toDiagram(track, W, H, 26);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const start = points[0]!;
  const end = points[points.length - 1]!;
  // Each diagram point with its distance along the course, in the course's official metres.
  const scale = officialM / track.totalM;
  const data = {
    duration: reel.duration,
    paceSecPerKm: reel.paceSecPerKm,
    officialM,
    chapters: reel.chapters,
    points: points.map((p, i) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(track.cumulative[i]! * scale)]),
    words: { onTheLine: t('radio.onTheLine'), play: t('radio.play'), pause: t('radio.pause'), resume: t('radio.resume') },
    locale,
  };
  const minutes = Math.round(reel.duration / 60);
  return (
    <section class="radio" id="ecouter" aria-labelledby="radio-title">
      <div class="radio-head">
        <h2 id="radio-title">{t('radio.title')}</h2>
        <p>{t('radio.intro', { minutes })}</p>
      </div>
      <div class="radio-body">
        <div class="radio-map">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('landing.course.map')}>
            <path d={d} class="radio-line" />
            <path d={d} class="radio-trodden" pathLength="1000" data-role="trodden" />
            <circle cx={end.x} cy={end.y} r="9" class="radio-finish" />
            <circle cx={start.x} cy={start.y} r="7" class="radio-start" />
            <g data-role="runner" transform={`translate(${start.x} ${start.y})`}>
              <circle r="16" class="radio-halo" />
              <circle r="7" class="radio-runner" />
            </g>
          </svg>
        </div>
        <div class="radio-panel">
          <div class="radio-numbers">
            <div>
              <span class="radio-k">{t('radio.clock')}</span>
              <span class="radio-v is-words" data-role="clock">
                {t('radio.onTheLine')}
              </span>
            </div>
            <div>
              <span class="radio-k">{t('radio.distance')}</span>
              <span class="radio-v" data-role="km">
                {formatKm(0, locale, 2)}
              </span>
            </div>
          </div>
          <p class="radio-chapter" data-role="chapter">
            {reel.chapters[0]!.title}
          </p>
          <blockquote class="radio-caption" data-role="caption">
            {reel.chapters[0]!.caption}
          </blockquote>
          <div class="radio-controls">
            <button type="button" class="radio-play" data-role="play" aria-label={t('radio.play')}>
              <svg viewBox="0 0 24 24" aria-hidden="true" class="radio-icon-play">
                <path d="M8 5v14l11-7z" />
              </svg>
              <svg viewBox="0 0 24 24" aria-hidden="true" class="radio-icon-pause">
                <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
              </svg>
              <span data-role="play-label">{t('radio.play')}</span>
            </button>
            <div class="radio-progress" data-role="progress">
              <i data-role="bar" />
              {reel.chapters.map((c) => (
                <b style={`left:${((c.t / reel.duration) * 100).toFixed(2)}%`} />
              ))}
            </div>
          </div>
          <audio data-role="audio" preload="none" controls src={`/api/courses/${courseId}/reel.mp3`} />
        </div>
      </div>
      <details class="radio-list">
        <summary>{t('radio.chapters')}</summary>
        <ol>
          {reel.chapters.map((c, i) => (
            <li>
              <button type="button" data-seek={String(c.t)} data-index={String(i)}>
                <span class="radio-t">{clock(c.t)}</span>
                <span class="radio-km">{c.km === 0 ? t('landing.course.start') : formatKm(c.km * 1000, locale, 1).replace(/[.,]0 km$/, ' km')}</span>
                <span>{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </details>
      <p class="radio-note">{t('radio.note')}</p>
      <script type="application/json" id="radio-data" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
      <script dangerouslySetInnerHTML={{ __html: radioSource }} />
    </section>
  );
};
