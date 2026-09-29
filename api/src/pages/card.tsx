import type { CourseTrack, LatLng, Locale, Race, RaceReport } from '@sivoov/shared';
import { checkpointLabel, fitView, formatClock, formatPace, placeMarks, positionForRun, projectOnView, thinPoints, translator } from '@sivoov/shared';
import { CARD_SIZE } from '../lib/cards';
import type { CardFormat } from '../lib/cards';
import { FONTS_URL, tokens } from './tokens';

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

/** Where the ground under the course comes from: `/api/courses/<id>/map.png`, or null without a Mapbox token. */
export type MapBase = string | null;

const MAP_PAD = 44;

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

/** The finish's label ("21,1", "42,195") is longer than a kilometre's: a smaller figure keeps it in its circle. */
const dotClass = (label: string) => (label.length > 4 ? 'dot long' : label.length > 3 ? 'dot mid' : 'dot');

/** The circle's shade: light at the first timing point, the race's own colour at the finish. */
const shade = (i: number, n: number): number => Math.round(n <= 1 ? 100 : 38 + (62 * i) / (n - 1));
const circleFill = (pct: number) => `color-mix(in srgb, var(--race-primary) ${pct}%, var(--surface))`;
const circleInk = (pct: number) => (pct >= 60 ? 'var(--race-on-primary)' : 'var(--race-primary)');

type MapProps = { track: CourseTrack; officialM: number; report: RaceReport | null; width: number; height: number; mapBase: MapBase; locale: Locale; radius: number; line?: 'race' | 'white' };

/**
 * The course on its map with the timing points: the same view the Worker asks Mapbox for
 * (`fitView`, same padding), so the drawn line sits on the streets it follows.
 */
const ReportMap = ({ track, officialM, report, width, height, mapBase, locale, radius, line = 'race' }: MapProps) => {
  const view = fitView(track.points, width, height, MAP_PAD);
  const at = (m: number) => projectOnView(view, positionForRun(track, officialM, Math.max(0, Math.min(officialM, m))).point);
  const d = thinPoints(track.points, 700)
    .map((p: LatLng) => projectOnView(view, p))
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const checkpoints = report?.checkpoints ?? [];
  const marks = placeMarks(
    checkpoints.map((c) => {
      const p = at(c.meters);
      const a = at(c.meters - 80);
      const b = at(c.meters + 80);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: p.x, y: p.y, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len };
    }),
    radius,
    { width, height },
  );
  const start = at(0);
  const white = line === 'white';
  return (
    <div class="map" style={`width:${width}px;height:${height}px`}>
      {mapBase ? <img class="ground" src={`${mapBase}?base=1&style=light&w=${width}&h=${height}&pad=${MAP_PAD}`} alt="" /> : null}
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
        {white ? null : <path d={d} fill="none" stroke="var(--surface)" stroke-width="12" stroke-linejoin="round" stroke-linecap="round" opacity="0.9" />}
        <path d={d} fill="none" stroke={white ? '#ffffff' : 'var(--race-primary)'} stroke-width={white ? '9' : '5'} stroke-linejoin="round" stroke-linecap="round" opacity={white ? '1' : '0.8'} />
        <circle cx={start.x} cy={start.y} r={radius * 0.45} fill={white ? '#ffffff' : 'var(--surface)'} stroke={white ? 'none' : 'var(--race-primary)'} stroke-width="4" />
        {marks.map((m, i) => {
          const pct = shade(i, marks.length);
          const c = checkpoints[i]!;
          const label = checkpointLabel(c.meters, officialM, locale);
          return (
            <g>
              {Math.hypot(m.x - m.atX, m.y - m.atY) > 1 ? <line x1={m.atX} y1={m.atY} x2={m.x} y2={m.y} stroke="var(--race-primary)" stroke-width="2" /> : null}
              <circle cx={m.x} cy={m.y} r={radius} fill={circleFill(pct)} stroke="var(--surface)" stroke-width="3" />
              <text x={m.x} y={m.y} text-anchor="middle" dominant-baseline="central" fill={circleInk(pct)} font-size={label.length > 4 ? radius * 0.55 : label.length > 3 ? radius * 0.72 : radius * 0.95} class="mark-num">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/**
 * The two halves, and a negative split when there is one. No ranking on a picture (the
 * owner's call, 2026-09-29): it is the runner's own race, the certificate carries the rank.
 */
const Highlights = ({ report, locale }: { report: RaceReport; locale: Locale }) => {
  const t = translator(locale);
  const { halves } = report;
  const notes = halves?.negative ? [t('report.negative', { time: formatClock(halves.firstMs - halves.secondMs) })] : [];
  if (!halves && notes.length === 0) return null;
  return (
    <div class="highlights">
      {halves ? (
        <table>
          <tbody>
            <tr>
              <th>{t('report.half1')}</th>
              <td>{formatClock(halves.firstMs)}</td>
            </tr>
            <tr>
              <th>{t('report.half2')}</th>
              <td>{formatClock(halves.secondMs)}</td>
            </tr>
          </tbody>
        </table>
      ) : null}
      {notes.map((n) => (
        <p class="note">{n}</p>
      ))}
    </div>
  );
};

/** One row per timing point: the circle, the time over the segment, its pace. */
const SplitsTable = ({ report, officialM, locale }: { report: RaceReport; officialM: number; locale: Locale }) => {
  const t = translator(locale);
  const n = report.checkpoints.length;
  return (
    <table class="splits">
      <thead>
        <tr>
          <th>km</th>
          <th>{t('common.time')}</th>
          <th>{t('common.pace')}</th>
        </tr>
      </thead>
      <tbody>
        {report.checkpoints.map((c, i) => {
          const pct = shade(i, n);
          const label = checkpointLabel(c.meters, officialM, locale);
          return (
            <tr>
              <td>
                <span class={dotClass(label)} style={`background:${circleFill(pct)};color:${circleInk(pct)}`}>
                  {label}
                </span>
              </td>
              <td>{formatClock(c.segmentMs)}</td>
              <td>{formatPace(c.paceSecPerKm)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

/** The same splits laid across, one column per timing point: the portrait card's strip. */
const SplitsStrip = ({ report, officialM, locale }: { report: RaceReport; officialM: number; locale: Locale }) => {
  const t = translator(locale);
  const n = report.checkpoints.length;
  return (
    <table class="strip">
      <tbody>
        <tr>
          <th>km</th>
          {report.checkpoints.map((c, i) => {
            const pct = shade(i, n);
            const label = checkpointLabel(c.meters, officialM, locale);
            return (
              <td>
                <span class={dotClass(label)} style={`background:${circleFill(pct)};color:${circleInk(pct)}`}>
                  {label}
                </span>
              </td>
            );
          })}
        </tr>
        <tr>
          <th>{t('common.time')}</th>
          {report.checkpoints.map((c) => (
            <td>{formatClock(c.segmentMs)}</td>
          ))}
        </tr>
        <tr>
          <th>{t('common.pace')}</th>
          {report.checkpoints.map((c) => (
            <td>{formatPace(c.paceSecPerKm)}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
};

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

const cardStyles = (width: number, height: number) => `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
body { background: var(--race-primary); color: var(--race-on-primary); font-family: var(--font-body); -webkit-font-smoothing: antialiased; }
body.sticker { background: transparent; }
/* The card pages have no doctype (quirks mode): tables take no colour or font from above, so they get their own. */
table { border-collapse: collapse; width: 100%; color: var(--ink); font-family: var(--font-body); }

.report, .invite { width: 100%; height: 100%; padding: 28px 32px; display: flex; flex-direction: column; gap: 14px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.kicker { font-family: var(--font-num); font-weight: 700; font-size: 46px; line-height: 0.95; text-transform: uppercase; letter-spacing: 0.01em; }
.sub { font-size: 17px; margin-top: 6px; opacity: 0.85; }
.race-logo { max-height: 76px; max-width: 280px; object-fit: contain; }
.race-name { font-family: var(--font-num); font-weight: 700; font-size: 26px; line-height: 1; text-transform: uppercase; text-align: right; max-width: 360px; }

.stats { display: flex; gap: 10px; }
.stat { flex: 1 1 0; min-width: 0; border-radius: var(--radius-sm); overflow: hidden; background: var(--surface); color: var(--ink); text-align: center; }
.stat.wide { flex: 1.6 1 0; }
.stat .k { background: color-mix(in srgb, var(--race-primary) 80%, var(--surface)); color: var(--race-on-primary); font-size: 15px; font-weight: 600; padding: 5px 8px; }
.stat .v { font-family: var(--font-num); font-weight: 700; font-size: 25px; padding: 5px 8px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }

.panel { background: var(--surface); color: var(--ink); border-radius: var(--radius-sm); overflow: hidden; position: relative; }
.body { display: flex; gap: 12px; flex: 1; min-height: 0; }
.map { position: relative; overflow: hidden; background: var(--surface-2); }
.map .ground, .map svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.mark-num { font-family: var(--font-num); font-weight: 700; }
.address { position: absolute; right: 12px; bottom: 8px; font-family: var(--font-num); font-weight: 700; font-size: 17px; color: var(--race-primary); text-transform: uppercase; letter-spacing: 0.04em; }

.highlights { position: absolute; left: 12px; top: 12px; background: var(--surface); border: 2px solid var(--race-primary); border-radius: var(--radius-sm); padding: 8px 12px; max-width: 300px; }
.highlights th { text-align: left; font-weight: 600; font-size: 15px; padding: 2px 16px 2px 0; color: var(--ink-2); }
.highlights td { font-family: var(--font-num); font-weight: 700; font-size: 20px; text-align: right; font-variant-numeric: tabular-nums; }
.highlights .note { font-size: 14px; font-weight: 600; color: var(--race-primary); margin-top: 4px; line-height: 1.25; }

.splits th { font-size: 16px; font-weight: 700; padding: 10px 6px; text-align: center; border-bottom: 1px solid var(--border); }
.splits td { font-family: var(--font-num); font-weight: 600; font-size: 22px; text-align: center; padding: 4px 6px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.splits tr:last-child td { border-bottom: 0; }
.dot { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; font-family: var(--font-num); font-weight: 700; font-size: 17px; }
.dot.long { font-size: 11px; }
.dot.mid { font-size: 14px; }

/* 1200 x 630: the stats across, the map on the left, the splits on the right. */
.og .table-panel { width: 380px; display: flex; align-items: center; }
.og .splits td { font-size: 21px; padding: 2px 6px; }
.og .map-panel { width: 756px; }

/* Portraits: the name and time as the hero, then the map and the splits. */
.post .report, .story .report { padding: 40px 32px; gap: 18px; }
.hero { padding: 6px 0 2px; }
.hero .name { font-family: var(--font-display); font-weight: 500; font-size: 64px; line-height: 1.05; }
.hero .name.small { font-size: 48px; }
.hero .time { font-family: var(--font-num); font-weight: 700; font-size: 180px; line-height: 0.9; font-variant-numeric: tabular-nums; }
.story .hero .time { font-size: 230px; }
.post .stat .v, .story .stat .v { font-size: 34px; }
.post .stat .k, .story .stat .k { font-size: 18px; }
.post .kicker, .story .kicker { font-size: 56px; }
.post .sub, .story .sub { font-size: 22px; }
.post .map-panel, .story .map-panel { width: 1016px; }
.post .map-panel .map { margin: 8px; }
.story .map-panel .map { margin: 8px; }
.post .highlights, .story .highlights { max-width: 380px; padding: 12px 16px; }
.post .highlights td, .story .highlights td { font-size: 28px; }
.post .highlights th, .story .highlights th { font-size: 20px; }
.post .highlights .note, .story .highlights .note { font-size: 19px; }
.strip th { text-align: left; font-size: 18px; padding: 6px 10px; color: var(--ink-2); white-space: nowrap; }
.strip td { text-align: center; font-family: var(--font-num); font-weight: 600; font-size: 24px; padding: 6px 2px; border-left: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.strip tr + tr td, .strip tr + tr th { border-top: 1px solid var(--border); }
.post .table-panel { padding: 6px 4px; }
.story .splits td { font-size: 34px; padding: 6px; }
.story .splits th { font-size: 22px; }
.story .dot { width: 46px; height: 46px; font-size: 24px; }
.story .dot.long { font-size: 15px; }
.story .dot.mid { font-size: 19px; }
.cta { margin-top: auto; display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-family: var(--font-num); font-weight: 700; text-transform: uppercase; }
.cta span:first-child { font-size: 40px; }
.cta .url { font-size: 28px; opacity: 0.9; }

/* The sticker: white on nothing, a soft shadow so it reads over any photo. */
.sticker-card { width: 100%; height: 100%; padding: 120px 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; color: #ffffff; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45); text-align: center; }
.sticker-card .map { background: transparent; filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.45)); }
.s-race { font-family: var(--font-num); font-weight: 700; font-size: 52px; text-transform: uppercase; line-height: 1; max-width: 900px; }
.s-time { font-family: var(--font-num); font-weight: 700; font-size: 250px; line-height: 0.9; font-variant-numeric: tabular-nums; }
.s-facts { display: flex; gap: 36px; font-family: var(--font-num); font-weight: 700; font-size: 56px; }
.s-foot { font-size: 30px; font-weight: 600; margin-top: 12px; }
.s-url { font-family: var(--font-num); font-weight: 700; font-size: 34px; text-transform: uppercase; letter-spacing: 0.03em; }

/* The bib and the race cards. */
.invite-body { display: flex; gap: 20px; flex: 1; min-height: 0; }
.invite.og .map-panel { width: 560px; flex: none; }
.invite:not(.og) .invite-body { flex-direction: column; }
.invite:not(.og) .map-panel { width: 1016px; }
.invite:not(.og) .map-panel .map { margin: 8px; }
.invite-words { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 22px; min-width: 0; }
.plate { background: var(--surface); color: var(--ink); border-radius: var(--radius-sm); padding: 18px 24px 22px; text-align: center; border-top: 18px solid color-mix(in srgb, var(--race-primary) 80%, var(--surface)); }
.plate-race { font-family: var(--font-num); font-weight: 700; font-size: 20px; text-transform: uppercase; color: var(--race-primary); }
.plate-num { font-family: var(--font-num); font-weight: 700; font-size: 150px; line-height: 0.95; font-variant-numeric: tabular-nums; }
.plate-name { font-size: 26px; font-weight: 600; }
.headline { font-family: var(--font-display); font-weight: 500; font-size: 54px; line-height: 1.05; }
.invite-line { font-size: 22px; line-height: 1.35; opacity: 0.92; }
.invite .url { font-family: var(--font-num); font-weight: 700; font-size: 26px; text-transform: uppercase; letter-spacing: 0.03em; }
.invite:not(.og) .plate-num { font-size: 220px; }
.invite:not(.og) .headline { font-size: 80px; }
.invite:not(.og) .invite-line { font-size: 30px; }
.invite:not(.og) .kicker { font-size: 56px; }
.invite:not(.og) .sub { font-size: 24px; }
.invite:not(.og) { padding: 40px 32px; }
`;
