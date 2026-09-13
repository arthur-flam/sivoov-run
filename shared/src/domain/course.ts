import type { LatLng, Landmark } from '../schemas/course';
import { haversineM, bearingDeg, interpolate } from './geo';

export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/** A course polyline with cumulative distances, built once and reused for every lookup. */
export type CourseTrack = {
  points: LatLng[];
  /** cumulative[i] = distance along the track from the start to points[i]. */
  cumulative: number[];
  totalM: number;
  bounds: Bounds;
};

export const boundsOf = (points: LatLng[]): Bounds =>
  points.reduce(
    (b, p) => ({
      minLat: Math.min(b.minLat, p.lat),
      maxLat: Math.max(b.maxLat, p.lat),
      minLng: Math.min(b.minLng, p.lng),
      maxLng: Math.max(b.maxLng, p.lng),
    }),
    { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity },
  );

export const buildTrack = (points: LatLng[]): CourseTrack => {
  if (points.length < 2) throw new Error('a course needs at least two points');
  const cumulative = points.reduce<number[]>((acc, p, i) => {
    if (i === 0) return [0];
    const prev = points[i - 1]!;
    return [...acc, acc[i - 1]! + haversineM(prev, p)];
  }, []);
  return { points, cumulative, totalM: cumulative[cumulative.length - 1]!, bounds: boundsOf(points) };
};

/** Binary search: index of the segment containing distance m (points[i] .. points[i+1]). */
const segmentAt = (track: CourseTrack, m: number): number => {
  const { cumulative } = track;
  let lo = 0;
  let hi = cumulative.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid]! <= m) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

export type TrackPosition = { point: LatLng; bearing: number; segmentIndex: number; trackM: number };

/** Where on the track you are after `m` meters along it. Clamped to [0, totalM]. */
export const positionAtDistance = (track: CourseTrack, m: number): TrackPosition => {
  const trackM = Math.max(0, Math.min(track.totalM, m));
  const i = segmentAt(track, trackM);
  const a = track.points[i]!;
  const b = track.points[i + 1]!;
  const segLen = track.cumulative[i + 1]! - track.cumulative[i]!;
  const t = segLen > 0 ? (trackM - track.cumulative[i]!) / segLen : 0;
  return { point: interpolate(a, b, t), bearing: bearingDeg(a, b), segmentIndex: i, trackM };
};

/**
 * The runner covers the official distance (e.g. 42195 m) while the GPX may measure slightly
 * more or less. Progress on the virtual course is proportional: finish line at the finish.
 */
export const trackMetersForRun = (track: CourseTrack, officialM: number, runM: number): number =>
  officialM > 0 ? Math.max(0, Math.min(track.totalM, (runM / officialM) * track.totalM)) : 0;

export const positionForRun = (track: CourseTrack, officialM: number, runM: number): TrackPosition =>
  positionAtDistance(track, trackMetersForRun(track, officialM, runM));

/** Landmarks are placed by official distance. The next one strictly ahead of the runner. */
export const nextLandmark = (landmarks: Landmark[], runM: number): Landmark | undefined =>
  [...landmarks].sort((a, b) => a.meters - b.meters).find((l) => l.meters > runM);

/** The official distance a runner has covered when they stand at `trackM` on the polyline. */
export const runMetersForTrack = (track: CourseTrack, officialM: number, trackM: number): number =>
  track.totalM > 0 ? Math.max(0, Math.min(officialM, (trackM / track.totalM) * officialM)) : 0;

export type TrackProjection = { trackM: number; offsetM: number; point: LatLng; segmentIndex: number };

/**
 * The point of the track closest to `p`, and how far along the track it is. Authoring-time:
 * the studio turns a click on the map into a distance so the event gets a `distance` trigger.
 * Flat-earth per segment, which is exact enough over a few hundred meters.
 */
export const nearestOnTrack = (track: CourseTrack, p: LatLng): TrackProjection => {
  const kx = Math.cos((p.lat * Math.PI) / 180);
  const best = track.points.slice(0, -1).reduce(
    (acc, a, i) => {
      const b = track.points[i + 1]!;
      const ax = (a.lng - p.lng) * kx;
      const ay = a.lat - p.lat;
      const bx = (b.lng - p.lng) * kx;
      const by = b.lat - p.lat;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const x = ax + dx * t;
      const y = ay + dy * t;
      const d2 = x * x + y * y;
      return d2 < acc.d2 ? { d2, i, t } : acc;
    },
    { d2: Infinity, i: 0, t: 0 },
  );
  const a = track.points[best.i]!;
  const b = track.points[best.i + 1]!;
  const segLen = track.cumulative[best.i + 1]! - track.cumulative[best.i]!;
  const point = interpolate(a, b, best.t);
  return { trackM: track.cumulative[best.i]! + segLen * best.t, offsetM: haversineM(p, point), point, segmentIndex: best.i };
};

export type DiagramPoint = { x: number; y: number };

/**
 * Projects the track into a box for the SVG course diagram: equirectangular, aspect
 * preserved, centered. Same function on the web pages and in the app.
 */
export const toDiagram = (
  track: CourseTrack,
  width: number,
  height: number,
  padding = 0,
): { points: DiagramPoint[]; project: (p: LatLng) => DiagramPoint } => {
  const { bounds } = track;
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const spanX = (bounds.maxLng - bounds.minLng) * kx || 1e-9;
  const spanY = bounds.maxLat - bounds.minLat || 1e-9;
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offsetX = padding + (innerW - spanX * scale) / 2;
  const offsetY = padding + (innerH - spanY * scale) / 2;
  const project = (p: LatLng): DiagramPoint => ({
    x: offsetX + (p.lng - bounds.minLng) * kx * scale,
    y: offsetY + (bounds.maxLat - p.lat) * scale,
  });
  return { points: track.points.map(project), project };
};

/** Keeps roughly every n-th point, always the first and last. For diagrams and previews. */
export const decimate = (points: LatLng[], keepEvery: number): LatLng[] =>
  points.filter((_, i) => i % keepEvery === 0 || i === points.length - 1);
