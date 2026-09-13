import {
  AudioScriptSchema,
  CourseGeometrySchema,
  buildTrack,
  decimate,
  describeTrigger,
  estimateFirings,
  nearestOnTrack,
  positionForRun,
  renderableLines,
  runMetersForTrack,
} from '@sivoov/shared';
import type { AudioScript, Course, CourseGeometry, CourseTrack, EstimatedFiring, LatLng, ScriptLine } from '@sivoov/shared';
import type { Bindings } from '../env';
import { scriptDb } from '../db/scriptQueries';
import type { PackSummary } from '../db/scriptQueries';
import { ttsHash, ttsKey } from './tts';

export const DEFAULT_PACE_SEC_PER_KM = 330; // 5:30 /km, the reference runner of the PRD
/** Enough points for a faithful line on a phone without shipping the whole GPX to the page. */
const MAP_POINTS = 900;

export const geometryKeyFor = (courseId: string): string => `courses/${courseId}/geometry.json`;

/** The course polyline from R2. No bundled fallback here: the studio must say "aucun tracé". */
export const loadGeometry = async (files: R2Bucket, course: Course): Promise<CourseGeometry | null> => {
  if (!course.geometryKey) return null;
  const object = await files.get(course.geometryKey);
  if (!object) return null;
  const parsed = CourseGeometrySchema.safeParse(await object.json());
  return parsed.success ? parsed.data : null;
};

/** A firing placed on the map: `null` coordinates for pace triggers and for a course with no trace. */
export type PlacedFiring = EstimatedFiring & { lat: number | null; lng: number | null };

export const placeFirings = (firings: EstimatedFiring[], track: CourseTrack | null, officialM: number): PlacedFiring[] =>
  firings.map((f) => {
    if (!track || f.meters === null) return { ...f, lat: null, lng: null };
    const { point } = positionForRun(track, officialM, f.meters);
    return { ...f, lat: point.lat, lng: point.lng };
  });

export type Tick = { km: number; lat: number; lng: number };

export const kmTicks = (track: CourseTrack, officialM: number): Tick[] =>
  Array.from({ length: Math.max(0, Math.floor(officialM / 1000)) }, (_, i) => {
    const { point } = positionForRun(track, officialM, (i + 1) * 1000);
    return { km: i + 1, lat: point.lat, lng: point.lng };
  });

/** Per line: is its current text already rendered, under which hash, and when it fires. */
export type LineStatus = { id: string; hash: string; template: boolean; rendered: boolean; bytes: number; summary: string };

export const lineStatuses = async (files: R2Bucket, script: AudioScript): Promise<LineStatus[]> => {
  const renderable = new Set(renderableLines(script).map((l) => l.id));
  return Promise.all(
    script.lines.map(async (line: ScriptLine): Promise<LineStatus> => {
      const template = !renderable.has(line.id);
      const hash = await ttsHash(script.voice, line.text);
      const summary = describeTrigger(line.trigger, script.locale);
      if (template) return { id: line.id, hash, template, rendered: false, bytes: 0, summary };
      const head = await files.head(ttsKey(hash));
      return { id: line.id, hash, template, rendered: head !== null, bytes: head?.size ?? 0, summary };
    }),
  );
};

export type StudioEstimates = {
  paceSecPerKm: number;
  firings: PlacedFiring[];
  lines: LineStatus[];
};

/** Everything the page and the JSON endpoints both need: positions, plus render state. */
export const studioEstimates = async (
  files: R2Bucket,
  script: AudioScript,
  officialM: number,
  track: CourseTrack | null,
  paceSecPerKm: number,
): Promise<StudioEstimates> => ({
  paceSecPerKm,
  firings: placeFirings(estimateFirings(script.lines, officialM, paceSecPerKm), track, officialM),
  lines: await lineStatuses(files, script),
});

export type StudioPageData = StudioEstimates & {
  courseId: string;
  locale: string;
  distanceM: number;
  measuredM: number | null;
  version: number;
  updatedAt: string | null;
  points: LatLng[];
  ticks: Tick[];
  landmarks: { id: string; name: string; meters: number; lat: number | null; lng: number | null }[];
  packs: PackSummary[];
  mapboxToken: string | null;
  ttsReady: boolean;
  script: AudioScript;
};

export const mapPoints = (geometry: CourseGeometry): LatLng[] =>
  geometry.points.length > MAP_POINTS ? decimate(geometry.points, Math.ceil(geometry.points.length / MAP_POINTS)) : geometry.points;

/** A click on the map becomes an official distance along the course. */
export const distanceForClick = (track: CourseTrack, officialM: number, p: LatLng): { meters: number; offsetM: number } => {
  const { trackM, offsetM } = nearestOnTrack(track, p);
  return { meters: Math.round(runMetersForTrack(track, officialM, trackM)), offsetM: Math.round(offsetM) };
};

export const trackFor = (geometry: CourseGeometry | null): CourseTrack | null => (geometry ? buildTrack(geometry.points) : null);

/** The voice of the house (a recorded decision, AUDIO.md): every new script starts with it. */
export const DEFAULT_VOICE = { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', model: 'eleven_multilingual_v2' };

export const emptyScript = (courseId: string, locale: 'fr' | 'en', version: number): AudioScript =>
  AudioScriptSchema.parse({ courseId, locale, version, voice: DEFAULT_VOICE, lines: [] });

export type StudioContext = {
  script: AudioScript;
  version: number;
  updatedAt: string | null;
  geometry: CourseGeometry | null;
  track: CourseTrack | null;
};

/**
 * The draft (an empty one when the course has none yet) plus the geometry it is drawn on.
 * A course with no draft gets version = latest published + 1, so publishing never
 * overwrites a live pack.
 */
export const loadStudioContext = async (env: Bindings, course: Course, locale: 'fr' | 'en' = 'fr'): Promise<StudioContext> => {
  const scripts = scriptDb(env.DB);
  const draft = await scripts.draft(course.id, locale);
  const version = draft?.version ?? (await scripts.latestPackVersion(course.id, locale)) + 1;
  const geometry = await loadGeometry(env.FILES, course);
  return {
    script: draft?.script ?? emptyScript(course.id, locale, version),
    version,
    updatedAt: draft?.updatedAt ?? null,
    geometry,
    track: trackFor(geometry),
  };
};

export const paceFromQuery = (raw: string | undefined): number => {
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 120 && seconds <= 1200 ? Math.round(seconds) : DEFAULT_PACE_SEC_PER_KM;
};

/** Everything the studio page renders, in one object; the same shape rides to the browser. */
export const studioPageData = async (env: Bindings, course: Course, ctx: StudioContext, paceSecPerKm: number): Promise<StudioPageData> => {
  const estimates = await studioEstimates(env.FILES, ctx.script, course.distanceM, ctx.track, paceSecPerKm);
  return {
    ...estimates,
    courseId: course.id,
    locale: ctx.script.locale,
    distanceM: course.distanceM,
    measuredM: ctx.track ? Math.round(ctx.track.totalM) : null,
    version: ctx.version,
    updatedAt: ctx.updatedAt,
    points: ctx.geometry ? mapPoints(ctx.geometry) : [],
    ticks: ctx.track ? kmTicks(ctx.track, course.distanceM) : [],
    landmarks: course.landmarks.map((l) => {
      const point = ctx.track ? positionForRun(ctx.track, course.distanceM, l.meters).point : null;
      return { id: l.id, name: l.name, meters: l.meters, lat: point?.lat ?? null, lng: point?.lng ?? null };
    }),
    packs: await scriptDb(env.DB).packs(course.id),
    mapboxToken: env.MAPBOX_TOKEN ?? null,
    ttsReady: Boolean(env.ELEVENLABS_API_TOKEN),
    script: ctx.script,
  };
};
