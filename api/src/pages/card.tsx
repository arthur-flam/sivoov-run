import type { CourseTrack, Locale, Race } from '@sivoov/shared';
import { translator } from '@sivoov/shared';
import { CARD_SIZE } from '../lib/cards';
import type { CardFormat } from '../lib/cards';
import { CourseDiagram } from './courseDiagram';
import { FONTS } from './layout';
import { tokens } from './styles';

/**
 * The runner on a card: a finisher (label "Finisher", the time) or an entrant before the finish
 * (label "Dossard", the bib). Absent, the card is the race's own, under the landing page.
 */
export type CardRunner = { label: string; name: string; big: string; meta: string };

type Props = { race: Race; track: CourseTrack; format: CardFormat; locale: Locale; host: string; runner?: CardRunner; subtitle: string };

/**
 * One page, photographed into a PNG by Browser Rendering (lib/cards.ts): the image a runner
 * posts and the preview under a shared link. Fixed pixel size, no page chrome. It carries the
 * information, the site's tokens and the existing course diagram, and nothing of its own: the
 * visual identity is not decided (docs/DESIGN.md), and when it is, this is where the card
 * gets its look.
 */
export const ShareCard = ({ race, track, format, locale, host, runner, subtitle }: Props) => {
  const t = translator(locale);
  const { width, height } = CARD_SIZE[format];
  const diagram = format === 'og' ? { width: 420, height: 420 } : { width: 820, height: 560 };
  return (
    <html lang={locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content={`width=${width}`} />
        <meta name="robots" content="noindex" />
        <link rel="stylesheet" href={FONTS} />
        <style dangerouslySetInnerHTML={{ __html: tokens + cardStyles(width, height) }} />
      </head>
      <body class={format} style={`--race-primary:${race.theme.primary};--race-on-primary:${race.theme.onPrimary}`}>
        <main class="card">
          <header>
            <span>Sivoov Run</span>
            <span>{race.theme.displayName}</span>
          </header>
          <div class="course">
            <CourseDiagram track={track} officialM={track.totalM} landmarks={[]} {...diagram} />
          </div>
          {runner ? (
            <section class="who">
              <div class="label">{runner.label}</div>
              <div class="name">{runner.name}</div>
              <div class="big">{runner.big}</div>
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
            <span>{t('landing.eyebrow')}</span>
            <span>
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
body { background: var(--bg); color: var(--ink); font-family: var(--font-body); -webkit-font-smoothing: antialiased; }
.card { position: relative; width: 100%; height: 100%; padding: 56px 64px; display: flex; flex-direction: column; }
header, footer { display: flex; justify-content: space-between; gap: 24px; font-size: 22px; color: var(--ink-2); }
footer { margin-top: 32px; font-size: 20px; }
.course { position: absolute; }
.course svg { width: 100%; height: 100%; }
.who { position: relative; margin-top: auto; }
.label { font-size: 24px; color: var(--ink-2); }
.name, .headline { font-family: var(--font-display); font-weight: 500; line-height: 1.05; margin-top: 12px; }
.big { font-family: var(--font-num); font-weight: 700; line-height: 0.95; font-variant-numeric: tabular-nums; }
.meta { font-size: 28px; color: var(--ink-2); margin-top: 12px; }

/* 1200 x 630: the words on the left, the course on the right. */
.og .course { right: 64px; top: 110px; width: 420px; height: 420px; }
.og .who { max-width: 640px; }
.og .name { font-size: 52px; }
.og .big { font-size: 168px; }
.og .headline { font-size: 58px; }

/* 1080 x 1350: the course on top, the words below. */
.story .card { padding: 72px; }
.story .course { left: 130px; top: 140px; width: 820px; height: 560px; }
.story .name { font-size: 70px; }
.story .big { font-size: 230px; }
.story .headline { font-size: 84px; }
`;
