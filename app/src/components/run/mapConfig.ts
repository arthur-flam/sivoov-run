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
/** How often the runner's distance on the map moves on (the course line's split, the places passed). */
export const GLIDE_MS = 250;
/**
 * The followed camera gets one even move a second, aimed where the runner will be by then: the
 * map animates it itself, smoothly, with nothing to do in between. Short moves sent several
 * times a second stutter, each one starting and stopping.
 */
export const CAMERA_STEP_MS = 1000;
/** A change of view (overview to the start line, follow to overview) is a slow, visible move. */
export const MOVE_MS = 2600;
/** The strip at the bottom of the map with its logo and attribution, left to the map's own taps. */
export const MAP_CREDITS_H = 36;
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
  /** How far the runner turned the map by hand, degrees (0: the course's way, or north over the whole course). */
  turn: number;
  /** How fast `runM` moves on, meters a second on the phone's clock: the camera aims where the runner will be. */
  speedMps: number;
  /** The runner turned the map by hand, to `turn` degrees in all. */
  onTurn: (turn: number) => void;
  light: LightPreset;
  /** The style could not load (no network and nothing kept, a refused token, no WebGL): the screen draws the course instead. */
  onFail: () => void;
};

/**
 * Mapbox Standard's options. Close up, no place labels: they are mostly house numbers (Standard
 * has no switch for those alone), noise at a runner's eye level. Over the whole course, the town
 * and district names (no numbers at that zoom).
 */
export const basemapConfig = (light: LightPreset, view: RunMapView) => ({ lightPreset: light, showPointOfInterestLabels: false, showTransitLabels: false, showPlaceLabels: view !== 'follow' });

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

/** 'fly': a change of view. 'linear': the followed camera's steady move, or a jump (0 ms). 'ease': a turn of the map. */
export type CameraShot =
  | { kind: 'follow'; center: [number, number]; bearing: number; zoom: number; pitch: number; padding: Padding; mode: 'fly' | 'linear' | 'ease'; durationMs: number }
  | { kind: 'overview'; ne: [number, number]; sw: [number, number]; bearing: number; pitch: number; padding: Padding; mode: 'fly' | 'linear' | 'ease'; durationMs: number };

/** `turn`: how far the runner turned the map from the course's way (or from north, over the whole course), degrees. */
export type CameraPlan = { view: RunMapView; turn: number; until: number; shot: CameraShot };

/** Where the runner is on the map and which way the course goes from there. */
export type Pose = { center: LatLng; bearing: number };

/** A turn let go of settles quickly; a big one at once (back to the course's way) is a visible swing. */
export const TURN_MS = 250;
export const SWING_MS = 700;
const SWING_DEG = 20;

/** An angle brought within (-180, 180]. */
export const normalizeTurn = (deg: number): number => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

/** An angle brought within [0, 360), as the maps take a bearing. */
const bearingOf = (deg: number): number => ((deg % 360) + 360) % 360;

type Bounds = { ne: [number, number]; sw: [number, number] };

const shotOf = (view: RunMapView, pose: Pose, bounds: Bounds, turn: number, mode: CameraShot['mode'], durationMs: number): CameraShot =>
  view === 'overview'
    ? { kind: 'overview', ...bounds, bearing: bearingOf(turn), pitch: OVERVIEW.pitch, padding: OVERVIEW.padding, mode, durationMs }
    : { kind: 'follow', center: lngLat(pose.center), bearing: bearingOf(pose.bearing + turn), zoom: FOLLOW.zoom, pitch: FOLLOW.pitch, padding: FOLLOW.padding, mode, durationMs };

/**
 * The next camera move. `at(ms)`: where the runner will be in `ms`. A change of view is one slow
 * eased move, left to finish. After it the followed camera moves once a second, evenly, to where
 * the runner will be a second later, so it never stops between two moves. A turn the runner let
 * go of settles at once, whatever the view. Pure: the maps keep the plan and apply its shot.
 */
export const nextCameraPlan = (prev: CameraPlan | null, view: RunMapView, at: (ms: number) => Pose, bounds: Bounds, now: number, { turn = 0 }: { turn?: number } = {}): CameraPlan => {
  const changed = prev === null || prev.view !== view;
  const turned = prev !== null && prev.turn !== turn;
  if (!changed && !turned && (now < prev.until || view === 'overview')) return prev;
  const swing = turned && Math.abs(normalizeTurn(turn - prev.turn)) > SWING_DEG;
  const [mode, durationMs] = changed ? (['fly', MOVE_MS] as const) : turned ? (['ease', swing ? SWING_MS : TURN_MS] as const) : (['linear', CAMERA_STEP_MS] as const);
  // The next steady move is sent a frame of the glide before this one ends: the camera never stands still between two.
  const until = now + durationMs - (mode === 'linear' ? GLIDE_MS : 0);
  return { view, turn, until, shot: shotOf(view, at(durationMs), bounds, turn, mode, durationMs) };
};

/** The camera now, for a turn under the runner's finger: no animation, the map follows the finger. */
export const jumpShot = (view: RunMapView, pose: Pose, bounds: Bounds, turn: number): CameraShot => shotOf(view, pose, bounds, turn, 'linear', 0);

/** The point of the map the camera turns around, in the map's own pixels: the runner, or the middle of the whole course. */
export const focusOf = (view: RunMapView, width: number, height: number): { x: number; y: number } => {
  const p = view === 'overview' ? OVERVIEW.padding : FOLLOW.padding;
  return { x: p.left + (width - p.left - p.right) / 2, y: p.top + (height - p.top - p.bottom) / 2 };
};
