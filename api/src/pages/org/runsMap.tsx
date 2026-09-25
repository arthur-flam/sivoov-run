import { boundsOf, buildTrack, formatClock, thinPoints, toDiagram } from '@sivoov/shared';
import type { LatLng } from '@sivoov/shared';
import { runMapClient } from './runMapClient';

export const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';

/** Enough points for a smooth line at any zoom, few enough to keep the page light. */
const MAP_POINTS = 1500;
const SVG_POINTS = 600;
const SVG_W = 640;

export type KmMark = { km: number; point: LatLng; elapsedMs: number | null };

type Props = {
  points: LatLng[];
  marks: KmMark[];
  /** The last point is the finish line, or where the runner stopped. */
  finished: boolean;
  /** Mapbox token for the tiles; null draws the trace alone. */
  token: string | null;
};

const markLabel = (m: KmMark) => (m.elapsedMs !== null ? `Km ${m.km} · ${formatClock(m.elapsedMs)}` : `Km ${m.km}`);

/** The trace alone, fitted to the box (equirectangular, as the course diagram). No tiles, no network. */
const TraceSvg = ({ points, marks, finished }: Omit<Props, 'token'>) => {
  const thin = thinPoints(points, SVG_POINTS);
  const b = boundsOf(thin);
  const kx = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180);
  const aspect = (b.maxLat - b.minLat) / Math.max(1e-9, (b.maxLng - b.minLng) * kx);
  const height = Math.round(Math.max(300, Math.min(560, SVG_W * aspect)));
  const { points: xy, project } = toDiagram(buildTrack(thin), SVG_W, height, 28);
  const d = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const start = xy[0]!;
  const end = xy[xy.length - 1]!;
  return (
    <svg viewBox={`0 0 ${SVG_W} ${height}`} role="img" aria-label="Tracé GPS du coureur">
      <path d={d} fill="none" stroke="var(--surface)" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" />
      <path d={d} fill="none" stroke="var(--race-primary)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
      {marks.map((m) => {
        const p = project(m.point);
        const labelled = m.km % 5 === 0;
        return (
          <g>
            <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={labelled ? '5' : '3.5'} fill="var(--surface)" stroke="var(--race-primary)" stroke-width="2">
              <title>{markLabel(m)}</title>
            </circle>
            {labelled ? (
              <text x={(p.x + 8).toFixed(1)} y={(p.y + 4).toFixed(1)} font-size="12" font-weight="600" fill="var(--ink-2)" stroke="var(--surface)" stroke-width="3" paint-order="stroke">
                {m.km}
              </text>
            ) : null}
          </g>
        );
      })}
      {/* The end is a dot and the start a ring around it: a loop starts and ends in the same place. */}
      <circle cx={end.x.toFixed(1)} cy={end.y.toFixed(1)} r="6" fill="var(--ink)" stroke="var(--surface)" stroke-width="2">
        <title>{finished ? 'Arrivée' : 'Arrêt'}</title>
      </circle>
      <circle cx={start.x.toFixed(1)} cy={start.y.toFixed(1)} r="10" fill="none" stroke="var(--good)" stroke-width="3.5">
        <title>Départ</title>
      </circle>
    </svg>
  );
};

/**
 * Where the runner actually ran: their own GPS trace, not the race course. On a Leaflet map
 * with Mapbox tiles when a token is set (the studio's recipe), otherwise, and whenever the map
 * cannot load, the same trace as a server-drawn SVG.
 */
export const RunTraceMap = ({ points, marks, finished, token }: Props) => {
  const withMap = token !== null && points.length >= 2;
  const island = {
    token,
    points: thinPoints(points, MAP_POINTS).map((p) => [Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))]),
    kms: marks.map((m) => ({ lat: Number(m.point.lat.toFixed(6)), lng: Number(m.point.lng.toFixed(6)), label: markLabel(m) })),
    endLabel: finished ? 'Arrivée' : 'Arrêt',
  };
  return (
    <>
      {withMap ? <div class="map-box" data-role="run-map"></div> : null}
      <div class={withMap ? 'map-svg hide' : 'map-svg'} data-role="run-map-fallback">
        <TraceSvg points={points} marks={marks} finished={finished} />
      </div>
      <div class="legend">
        <span>
          <i class="start"></i>Départ
        </span>
        <span>
          <i class="end"></i>
          {finished ? 'Arrivée' : 'Arrêt'}
        </span>
        {marks.length > 0 ? (
          <span>
            <i class="km"></i>Chaque kilomètre
          </span>
        ) : null}
      </div>
      {withMap ? (
        <>
          <script type="application/json" id="run-map-data" dangerouslySetInnerHTML={{ __html: JSON.stringify(island).replaceAll('<', '\\u003c') }} />
          <script src={LEAFLET_JS} defer></script>
          <script dangerouslySetInnerHTML={{ __html: runMapClient }} />
        </>
      ) : null}
    </>
  );
};
