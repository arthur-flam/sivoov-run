import type { CourseTrack, LatLng, Locale, RaceReport } from '@sivoov/shared';
import { checkpointLabel, fitView, formatClock, formatPace, placeMarks, positionForRun, projectOnView, thinPoints, translator } from '@sivoov/shared';

/**
 * The race report's building blocks, shared by the card formats (card.tsx): the course on its
 * map with a numbered circle at each timing point, the halves, the splits as a table or a strip.
 */

/** Where the ground under the course comes from: `/api/courses/<id>/map.png`, or null without a Mapbox token. */
export type MapBase = string | null;

/** The map's padding around the course, the same the Worker asks Mapbox for (`?pad=`). */
const MAP_PAD = 44;

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
export const ReportMap = ({ track, officialM, report, width, height, mapBase, locale, radius, line = 'race' }: MapProps) => {
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
 * owner's call, 2026-09-29): not everyone runs, and each runs their own race.
 */
export const Highlights = ({ report, locale }: { report: RaceReport; locale: Locale }) => {
  const t = translator(locale);
  const { halves } = report;
  const notes = halves?.negative ? [t('report.negative', { time: formatClock(halves.gainMs) })] : [];
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
export const SplitsTable = ({ report, officialM, locale }: { report: RaceReport; officialM: number; locale: Locale }) => {
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
export const SplitsStrip = ({ report, officialM, locale }: { report: RaceReport; officialM: number; locale: Locale }) => {
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
