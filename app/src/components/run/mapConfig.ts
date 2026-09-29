import type { CourseTrack, LatLng, Landmark, LightPreset } from '@sivoov/shared';
import { paddedBounds, positionForRun } from '@sivoov/shared';
import { colors } from '@/theme';

/**
 * The run screen's map, the same on a phone (@rnmapbox/maps) and in a browser (Mapbox GL JS):
 * Mapbox Standard (3D buildings and landmarks, lit by the hour), the course line split where
 * the runner is, the places along it, and the runner. Only legibility here, no identity: the
 * line is the race's colour, everything else the basemap's own.
 */
export const MAP_STYLE = 'mapbox://styles/mapbox/standard';

/**
 * Just behind and above the runner, looking down the course: close to eye level, still a map.
 * The runner stands low in the frame (a tall top padding), so most of the picture is the road ahead.
 */
export const FOLLOW = { zoom: 17.1, pitch: 72, padding: { top: 220, bottom: 24, left: 0, right: 0 } } as const;
/** The whole course, tilted enough to show the buildings, clear of the chips at the top. */
export const OVERVIEW = { pitch: 40, marginM: 30, padding: { top: 64, bottom: 24, left: 16, right: 16 } } as const;
/** How often the followed camera moves: often enough to glide, rarely enough to spare the battery. */
export const GLIDE_MS = 250;
/** A change of view (overview to the start line, follow to overview) is a slow, visible move. */
export const MOVE_MS = 2600;
/** The map draws at most this often: a runner glances at it, a game would need more. */
export const MAX_FPS = 30;

export type RunMapView = 'follow' | 'overview';

export type RunMapProps = {
  token: string;
  track: CourseTrack;
  officialM: number;
  /** The runner's distance as the map shows it (glided between fixes). */
  runM: number;
  landmarks: Landmark[];
  accent: string;
  view: RunMapView;
  light: LightPreset;
  /** The style could not load (no network and nothing kept, a refused token, no WebGL): the screen draws the course instead. */
  onFail: () => void;
};

export const basemapConfig = (light: LightPreset) => ({ lightPreset: light, showPointOfInterestLabels: false, showTransitLabels: false });

const lngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

export const courseLine = (track: CourseTrack): GeoJSON.Feature<GeoJSON.LineString> => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: track.points.map(lngLat) },
});

export const runnerPoint = (p: LatLng): GeoJSON.Feature<GeoJSON.Point> => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: lngLat(p) } });

/** The places along the course and the finish, each marked passed or not. */
export const courseMarks = (track: CourseTrack, officialM: number, landmarks: Landmark[], runM: number): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: 'FeatureCollection',
  features: [
    ...landmarks
      .filter((l) => l.meters > 0 && l.meters < officialM)
      .map((l) => ({ ...runnerPoint(positionForRun(track, officialM, l.meters).point), properties: { kind: 'place', passed: l.meters <= runM } })),
    { ...runnerPoint(track.points[track.points.length - 1]!), properties: { kind: 'finish', passed: false } },
  ],
});

/** [[east, north], [west, south]] of the course with a margin, as Mapbox asks for bounds. */
export const overviewBounds = (track: CourseTrack, marginM: number = OVERVIEW.marginM): { ne: [number, number]; sw: [number, number] } => {
  const b = paddedBounds(track.bounds, marginM);
  return { ne: [b.maxLng, b.maxLat], sw: [b.minLng, b.minLat] };
};

/** Paint for the layers, shared by both maps. Emissive so the line stays bright under a night light. */
export const paint = (accent: string) => ({
  casing: { color: colors.night, width: 10, opacity: 0.45 },
  rest: { color: colors.snow, width: 5, opacity: 0.9 },
  run: { color: accent, width: 6.5 },
  runner: { radius: 9, color: colors.snow, stroke: accent, strokeWidth: 4, halo: 22, haloOpacity: 0.3 },
  place: { radius: 5, color: colors.night, stroke: colors.snow, passedStroke: accent, strokeWidth: 2.5 },
  finish: { radius: 7, color: colors.snow, stroke: colors.night, strokeWidth: 3 },
});

/** Where the camera goes and how: a view of the runner (follow) or of the whole course (overview). */
export type Padding = { top: number; bottom: number; left: number; right: number };

export type CameraShot =
  | { kind: 'follow'; center: [number, number]; bearing: number; zoom: number; pitch: number; padding: Padding; mode: 'fly' | 'linear'; durationMs: number }
  | { kind: 'overview'; ne: [number, number]; sw: [number, number]; pitch: number; padding: Padding; mode: 'fly'; durationMs: number };

export type CameraPlan = { view: RunMapView; until: number; shot: CameraShot };

/**
 * The next camera move. A change of view is one slow eased move, left to finish (a runner moves
 * a few meters meanwhile); after it the followed camera glides from point to point at the
 * pace of the updates. Pure: the maps keep the plan and apply its shot.
 */
export const nextCameraPlan = (prev: CameraPlan | null, view: RunMapView, follow: { center: LatLng; bearing: number }, bounds: { ne: [number, number]; sw: [number, number] }, now: number): CameraPlan => {
  const changed = prev === null || prev.view !== view;
  if (!changed && (now < prev.until || view === 'overview')) return prev;
  const mode = changed ? 'fly' : 'linear';
  const shot: CameraShot =
    view === 'overview'
      ? { kind: 'overview', ...bounds, pitch: OVERVIEW.pitch, padding: OVERVIEW.padding, mode: 'fly', durationMs: MOVE_MS }
      : { kind: 'follow', center: lngLat(follow.center), bearing: follow.bearing, zoom: FOLLOW.zoom, pitch: FOLLOW.pitch, padding: FOLLOW.padding, mode, durationMs: changed ? MOVE_MS : GLIDE_MS };
  return { view, until: changed ? now + MOVE_MS : now, shot };
};
