import type { CourseTrack, Locale, Race } from '@sivoov/shared';
import { decimate, toDiagram, translator } from '@sivoov/shared';
import { CARD_SIZE } from '../lib/cards';
import type { CardFormat } from '../lib/cards';
import { FONTS } from './layout';

/**
 * The runner on a card: a finisher (label "Finisher", the time) or an entrant before the finish
 * (label "Dossard", the bib). Absent, the card is the race's own, under the landing page.
 */
export type CardRunner = { label: string; name: string; big: string; meta: string };

type Props = { race: Race; track: CourseTrack; format: CardFormat; locale: Locale; host: string; runner?: CardRunner; subtitle: string };

const coursePath = (track: CourseTrack, width: number, height: number): { d: string; start: { x: number; y: number }; end: { x: number; y: number } } => {
  const { points } = toDiagram({ ...track, points: decimate(track.points, 3) }, width, height, 8);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return { d, start: points[0]!, end: points[points.length - 1]! };
};

/**
 * One page, photographed into a PNG by Browser Rendering (lib/cards.ts): the image a finisher
 * posts and the preview under a shared link. Fixed pixel size, no page chrome, race colours.
 */
export const ShareCard = ({ race, track, format, locale, host, runner, subtitle }: Props) => {
  const t = translator(locale);
  const { width, height } = CARD_SIZE[format];
  const course = format === 'og' ? { w: 420, h: 430 } : { w: 820, h: 560 };
  const { d, start, end } = coursePath(track, course.w, course.h);
  return (
    <html lang={locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content={`width=${width}`} />
        <meta name="robots" content="noindex" />
        <link rel="stylesheet" href={FONTS} />
        <style dangerouslySetInnerHTML={{ __html: cardStyles(width, height) }} />
      </head>
      <body class={format} style={`--primary:${race.theme.primary};--on:${race.theme.onPrimary}`}>
        <main class="card">
          <header>
            <span class="mark">
              Sivoov <i>Run</i>
            </span>
            <span class="race">{race.theme.displayName}</span>
          </header>
          <svg class="course" viewBox={`0 0 ${course.w} ${course.h}`} aria-hidden="true">
            <path d={d} class="halo" />
            <path d={d} class="line" />
            <circle cx={start.x} cy={start.y} r="9" class="dot" />
            <rect x={end.x - 9} y={end.y - 9} width="18" height="18" class="finish" transform={`rotate(45 ${end.x} ${end.y})`} />
          </svg>
          {runner ? (
            <section class="who">
              <div class="label">{runner.label}</div>
              <div class="name">{runner.name}</div>
              <div class="time">{runner.big}</div>
              <div class="meta">{runner.meta}</div>
            </section>
          ) : (
            <section class="who">
              <div class="label">{t('landing.eyebrow')}</div>
              <div class="headline">{t('landing.tagline', { race: race.theme.displayName })}</div>
              <div class="meta">{subtitle}</div>
            </section>
          )}
          <footer>
            <span>{runner ? t('landing.eyebrow') : t('landing.poweredBy')}</span>
            <span class="url">
              {host}/{race.slug}
            </span>
          </footer>
        </main>
      </body>
    </html>
  );
};

const cardStyles = (width: number, height: number) => `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
body { background: var(--primary); color: var(--on); font-family: 'DM Sans', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.card { position: relative; width: 100%; height: 100%; padding: 56px 64px; display: flex; flex-direction: column; }
.card::after { content: ''; position: absolute; inset: 22px; border: 2px solid color-mix(in srgb, var(--on) 22%, transparent); border-radius: 18px; pointer-events: none; }
header { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; font-size: 22px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600; }
.mark { font-family: 'Fraunces', Georgia, serif; font-weight: 500; letter-spacing: 0; text-transform: none; font-size: 30px; white-space: nowrap; }
.mark i { font-style: normal; color: #e8786f; }
.race { opacity: 0.8; text-align: right; }
.course { position: absolute; }
.course .halo { fill: none; stroke: color-mix(in srgb, var(--on) 14%, transparent); stroke-width: 22; stroke-linejoin: round; stroke-linecap: round; }
.course .line { fill: none; stroke: var(--on); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round; }
.course .dot { fill: #e8786f; }
.course .finish { fill: var(--on); }
.who { position: relative; margin-top: auto; }
.label { display: inline-block; font-size: 22px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--primary); background: var(--on); padding: 8px 16px 7px; border-radius: 6px; }
.name { font-family: 'Fraunces', Georgia, serif; font-weight: 500; line-height: 1.05; letter-spacing: -0.01em; margin-top: 22px; }
.time { font-family: 'Barlow Condensed', 'DM Sans', sans-serif; font-weight: 700; line-height: 0.9; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.headline { font-family: 'Fraunces', Georgia, serif; font-weight: 500; line-height: 1.04; letter-spacing: -0.02em; margin-top: 24px; }
.meta { font-size: 28px; opacity: 0.85; margin-top: 14px; }
footer { position: relative; display: flex; justify-content: space-between; gap: 24px; font-size: 20px; opacity: 0.75; margin-top: 36px; }
.url { font-weight: 600; }

/* 1200 x 630: the words on the left, the course on the right. */
.og .course { right: 60px; top: 130px; width: 420px; height: 430px; }
.og .who { max-width: 640px; }
.og .name { font-size: 54px; }
.og .time { font-size: 170px; margin-top: 6px; }
.og .headline { font-size: 60px; }
.og .meta { font-size: 26px; }

/* 1080 x 1350: the course on top, the words below. */
.story .card { padding: 72px; }
.story .course { left: 130px; top: 150px; width: 820px; height: 560px; }
.story .name { font-size: 72px; }
.story .time { font-size: 240px; margin-top: 8px; }
.story .headline { font-size: 88px; }
.story .meta { font-size: 34px; }
.story footer { font-size: 24px; }
`;
