import type { CardFormat, CourseTrack, Locale, Race, RaceReport } from '@sivoov/shared';
import { translator } from '@sivoov/shared';
import { CARD_SIZE } from '../lib/cards';
import { cardStyles } from './cardStyles';
import { Highlights, ReportMap, SplitsStrip, SplitsTable } from './reportParts';
import type { MapBase } from './reportParts';
import { FONTS_URL, tokens } from './tokens';

export type { MapBase } from './reportParts';

/**
 * The share cards: fixed-size pages that Browser Rendering photographs into PNGs (lib/cards.ts),
 * the picture under every shared link and the image a runner posts. The look follows the big
 * city marathons' race reports (the owner's brief, 2026-09-29): the race's colour as the
 * ground, white panels, the course on a map with a numbered circle at each timing point, the
 * splits beside it. Colours are the race layer and the site's tokens only (DESIGN.md).
 */

/** The runner before the finish: the bib card, for "I'm in, run it with me". */
export type CardRunner = { label: string; name: string; big: string; meta: string };

/** A finisher's report, every string already in the page's language. */
export type FinisherCard = {
  name: string;
  bib: string;
  time: string;
  pace: string;
  date: string;
  distance: string;
  officialM: number;
  report: RaceReport;
};


const Page = ({ format, locale, race, children }: { format: CardFormat; locale: Locale; race: Race; children: unknown }) => {
  const { width, height } = CARD_SIZE[format];
  return (
    <html lang={locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content={`width=${width}`} />
        <meta name="robots" content="noindex" />
        <link rel="stylesheet" href={FONTS_URL} />
        <style dangerouslySetInnerHTML={{ __html: tokens + cardStyles(width, height) }} />
      </head>
      <body class={format} style={`--race-primary:${race.theme.primary};--race-on-primary:${race.theme.onPrimary}`}>
        {children}
      </body>
    </html>
  );
};

/** The race's name, or its logo when the organizer gave one. */
const RaceMark = ({ race }: { race: Race }) =>
  race.theme.logo ? <img class="race-logo" src={race.theme.logo} alt={race.theme.displayName} /> : <div class="race-name">{race.theme.displayName}</div>;

const Head = ({ race, title, sub }: { race: Race; title: string; sub: string }) => (
  <header class="head">
    <div>
      <div class="kicker">{title}</div>
      <div class="sub">{sub}</div>
    </div>
    <RaceMark race={race} />
  </header>
);

const Stat = ({ k, v, wide = false, testId }: { k: string; v: string; wide?: boolean; testId?: string }) => (
  <div class={wide ? 'stat wide' : 'stat'}>
    <div class="k">{k}</div>
    <div class="v" data-testid={testId}>
      {v}
    </div>
  </div>
);

type ReportProps = { race: Race; track: CourseTrack; format: CardFormat; locale: Locale; host: string; runner: FinisherCard; mapBase: MapBase };

/** A finisher's race report, in the format asked for. */
export const ReportCard = ({ race, track, format, locale, host, runner, mapBase }: ReportProps) => {
  const t = translator(locale);
  const address = `${host}/${race.slug}`;
  const sub = `${runner.distance} · ${t('landing.eyebrow')}`;
  const nameSize = runner.name.length > 22 ? 'name small' : 'name';
  const stats = [
    <Stat k={t('report.name')} v={runner.name} wide />,
    <Stat k={t('result.bib')} v={runner.bib} />,
    <Stat k={t('report.time')} v={runner.time} testId="card-time" />,
    <Stat k={t('common.pace')} v={`${runner.pace} /km`} />,
    <Stat k={t('result.date')} v={runner.date} />,
  ];
  if (format === 'sticker') {
    return (
      <Page format={format} locale={locale} race={race}>
        <main class="sticker-card">
          <div class="s-race">{race.theme.displayName}</div>
          <ReportMap track={track} officialM={runner.officialM} report={null} width={880} height={820} mapBase={null} locale={locale} radius={22} line="white" />
          <div class="s-time" data-testid="card-time">
            {runner.time}
          </div>
          <div class="s-facts">
            <span>{runner.distance}</span>
            <span>{runner.pace} /km</span>
          </div>
          <div class="s-foot">{t('landing.eyebrow')}</div>
          <div class="s-url">{address}</div>
        </main>
      </Page>
    );
  }
  if (format === 'og') {
    return (
      <Page format={format} locale={locale} race={race}>
        <main class="report">
          <Head race={race} title={t('report.title')} sub={sub} />
          <section class="stats">{stats}</section>
          <section class="body">
            <div class="panel map-panel">
              <ReportMap track={track} officialM={runner.officialM} report={runner.report} width={756} height={378} mapBase={mapBase} locale={locale} radius={17} />
              <Highlights report={runner.report} locale={locale} />
              <div class="address">{address}</div>
            </div>
            <div class="panel table-panel">
              <SplitsTable report={runner.report} officialM={runner.officialM} locale={locale} />
            </div>
          </section>
        </main>
      </Page>
    );
  }
  const story = format === 'story';
  return (
    <Page format={format} locale={locale} race={race}>
      <main class="report">
        <Head race={race} title={t('report.title')} sub={sub} />
        <section class="hero">
          <div class={nameSize}>{runner.name}</div>
          <div class="time" data-testid="card-time">
            {runner.time}
          </div>
        </section>
        {/* The name and the time are the hero here: the boxes carry the rest. */}
        <section class="stats">{[stats[1], ...stats.slice(3)]}</section>
        <div class="panel map-panel">
          <ReportMap track={track} officialM={runner.officialM} report={runner.report} width={1000} height={story ? 880 : 470} mapBase={mapBase} locale={locale} radius={story ? 26 : 22} />
          <Highlights report={runner.report} locale={locale} />
        </div>
        <div class="panel table-panel">
          {story ? <SplitsTable report={runner.report} officialM={runner.officialM} locale={locale} /> : <SplitsStrip report={runner.report} officialM={runner.officialM} locale={locale} />}
        </div>
        <footer class="cta">
          <span>{t('report.cta')}</span>
          <span class="url">{address}</span>
        </footer>
      </main>
    </Page>
  );
};

type Props = { race: Race; track: CourseTrack; format: CardFormat; locale: Locale; host: string; runner?: CardRunner; subtitle: string; mapBase: MapBase };

/**
 * The bib card (a runner before the finish) and the race's own card (under a shared landing
 * page): the same ground and panel as the report, the course on its map, the bib or the race's
 * invitation. The sticker format has no meaning here and draws as the portrait.
 */
export const ShareCard = ({ race, track, format: asked, locale, host, runner, subtitle, mapBase }: Props) => {
  const t = translator(locale);
  const format = asked === 'sticker' ? 'post' : asked;
  const map = format === 'og' ? { width: 560, height: 470 } : { width: 1000, height: format === 'story' ? 1000 : 640 };
  return (
    <Page format={format} locale={locale} race={race}>
      <main class={`invite ${format}`}>
        <Head race={race} title={runner ? runner.label : t('landing.eyebrow')} sub={runner ? runner.meta : subtitle} />
        <section class="invite-body">
          <div class="panel map-panel">
            <ReportMap track={track} officialM={track.totalM} report={null} width={map.width} height={map.height} mapBase={mapBase} locale={locale} radius={16} />
          </div>
          <div class="invite-words">
            {runner ? (
              <>
                <div class="plate" data-testid="card-bib">
                  <div class="plate-race">{race.theme.displayName}</div>
                  <div class="plate-num">{runner.big}</div>
                  <div class="plate-name">{runner.name}</div>
                </div>
                <p class="invite-line">{t('card.bib.invite')}</p>
              </>
            ) : (
              <>
                <div class="headline">{t('landing.tagline', { race: race.theme.displayName })}</div>
                <p class="invite-line">{t('landing.lede')}</p>
              </>
            )}
            <div class="url">
              {host}/{race.slug}
            </div>
          </div>
        </section>
      </main>
    </Page>
  );
};
