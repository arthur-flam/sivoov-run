import {
  AudioScriptSchema,
  CourseGeometrySchema,
  MOMENTS,
  buildTrack,
  decimate,
  estimateFirings,
  momentOf,
  nearestOnTrack,
  positionForRun,
  publishedContent,
  runMetersForTrack,
  whenInWords,
} from '@sivoov/shared';
import type { AudioScript, Course, CourseGeometry, CourseTrack, EstimatedFiring, LatLng, Moment, ScriptLine } from '@sivoov/shared';
import type { Bindings } from '../env';
import { scriptDb } from '../db/scriptQueries';
import type { PackSummary } from '../db/scriptQueries';
import { lineStatusView, publishView, summaryText } from '../pages/org/studioCopy';
import type { AudioSummary, LineSource } from '../pages/org/studioCopy';
import type { Tone } from '../pages/org/ui';
import { sha256Hex } from './crypto';
import { ttsHash, ttsKey } from './tts';
import { uploadKey } from './uploads';

export const DEFAULT_PACE_SEC_PER_KM = 330; // 5:30 /km, the reference runner of the PRD
/** Enough points for a faithful line on a phone without shipping the whole GPX to the page. */
const MAP_POINTS = 900;
/** A trace more than 3% off the official distance is probably the wrong file (or the wrong course). */
export const TRACE_TOLERANCE = 0.03;

export const geometryKeyFor = (courseId: string): string => `courses/${courseId}/geometry.json`;

/** The course polyline from R2. No bundled fallback here: the studio must say "aucun tracé". */
export const loadGeometry = async (files: R2Bucket, course: Course): Promise<CourseGeometry | null> => {
  if (!course.geometryKey) return null;
  const object = await files.get(course.geometryKey);
  if (!object) return null;
  const parsed = CourseGeometrySchema.safeParse(await object.json());
  return parsed.success ? parsed.data : null;
};

/** Whether the measured trace matches the official distance, within TRACE_TOLERANCE. */
export const traceMatches = (measuredM: number, officialM: number): boolean => Math.abs(measuredM - officialM) <= officialM * TRACE_TOLERANCE;

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

/**
 * Per line: where its sound comes from, whether that sound is ready for the current text, when
 * it plays in plain words and under which moment the studio lists it. `audioPath` is where
 * "Écouter" fetches it, relative to the course's studio URL; null means the browser reads the text.
 */
export type LineStatus = {
  id: string;
  source: LineSource;
  /** Voice: the TTS cache hash of the current text. Upload: the file's sha256. */
  hash: string;
  template: boolean;
  /** The sound is ready: the voice rendered for this exact text, or the uploaded file stored. */
  rendered: boolean;
  bytes: number;
  when: string;
  moment: Moment;
  audioPath: string | null;
  label: string;
  tone: Tone;
};

const sourceOf = (line: ScriptLine): LineSource => (line.audio ? 'upload' : line.slots ? 'template' : 'voice');

export const lineStatuses = async (files: R2Bucket, script: AudioScript, officialM: number): Promise<LineStatus[]> =>
  Promise.all(
    script.lines.map(async (line: ScriptLine): Promise<LineStatus> => {
      const source = sourceOf(line);
      const common = { id: line.id, source, template: source === 'template', when: whenInWords(line.trigger), moment: momentOf(line.trigger, officialM) };
      if (line.audio) {
        const head = await files.head(uploadKey(line.audio));
        const view = lineStatusView(source, head !== null);
        return { ...common, ...view, hash: line.audio.hash, rendered: head !== null, bytes: line.audio.bytes, audioPath: head ? `/uploads/${line.audio.hash}.${line.audio.format}` : null };
      }
      const hash = await ttsHash(script.voice, line.text);
      if (source === 'template') return { ...common, ...lineStatusView(source, false), hash, rendered: false, bytes: 0, audioPath: null };
      const head = await files.head(ttsKey(hash));
      return { ...common, ...lineStatusView(source, head !== null), hash, rendered: head !== null, bytes: head?.size ?? 0, audioPath: head ? `/audio/${hash}` : null };
    }),
  );

/** The studio's order: by moment, then by where each line first plays (pace ones last, as written). */
export const inRunningOrder = (lines: LineStatus[], firings: EstimatedFiring[]): LineStatus[] => {
  const rank = (s: LineStatus) => MOMENTS.indexOf(s.moment);
  const first = (s: LineStatus) => {
    const i = firings.findIndex((f) => f.eventId === s.id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...lines].sort((a, b) => rank(a) - rank(b) || first(a) - first(b));
};

export const scriptFingerprint = (script: Pick<AudioScript, 'voice' | 'lines'>): Promise<string> => sha256Hex(publishedContent(script));

/** Where the draft stands against what runners have: what is left to record, whether it changed, whether it can go out. */
export const audioSummary = async (
  script: AudioScript,
  lines: LineStatus[],
  lastPack: PackSummary | null,
  updatedAt: string | null,
): Promise<AudioSummary> => {
  const toRecord = lines.filter((l) => l.source !== 'template' && !l.rendered).length;
  const fingerprint = await scriptFingerprint(script);
  const changed =
    script.lines.length > 0 &&
    (script.published ? script.published.fingerprint !== fingerprint : lastPack ? updatedAt === null || updatedAt > lastPack.createdAt : true);
  return {
    lines: lines.length,
    toRecord,
    uploads: lines.filter((l) => l.source === 'upload').length,
    onScreen: lines.filter((l) => l.source === 'template').length,
    lastPublished: lastPack ? { version: lastPack.version, at: lastPack.createdAt } : null,
    changed,
    publish: script.lines.length === 0 ? 'empty' : toRecord > 0 ? 'missing' : changed ? 'ready' : 'current',
  };
};

export type StudioEstimates = {
  paceSecPerKm: number;
  firings: PlacedFiring[];
  /** In the studio's order (see inRunningOrder). */
  lines: LineStatus[];
  /** The header line and the publish button, worded by the Worker. */
  summary: AudioSummary & { text: string; button: ReturnType<typeof publishView> };
};

export type EstimateDeps = { files: R2Bucket; lastPack: PackSummary | null; updatedAt: string | null; timezone: string };

/** Everything the page and the JSON endpoints both need: positions, sound status, the summary line. */
export const studioEstimates = async (
  deps: EstimateDeps,
  script: AudioScript,
  officialM: number,
  track: CourseTrack | null,
  paceSecPerKm: number,
): Promise<StudioEstimates> => {
  const firings = placeFirings(estimateFirings(script.lines, officialM, paceSecPerKm), track, officialM);
  const lines = inRunningOrder(await lineStatuses(deps.files, script, officialM), firings);
  const summary = await audioSummary(script, lines, deps.lastPack, deps.updatedAt);
  return {
    paceSecPerKm,
    firings,
    lines,
    summary: { ...summary, text: summaryText(summary, deps.timezone), button: publishView(summary, deps.timezone) },
  };
};

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
  /** Viewers get the studio read-only: they listen, they do not edit. */
  canEdit: boolean;
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
  packs: PackSummary[];
};

/**
 * The draft (an empty one when the course has none yet) plus the geometry it is drawn on and
 * the packs already published. A course with no draft gets version = latest published + 1, so
 * publishing never overwrites a live pack.
 */
export const loadStudioContext = async (env: Bindings, course: Course, locale: 'fr' | 'en' = 'fr'): Promise<StudioContext> => {
  const scripts = scriptDb(env.DB);
  const [draft, packs, geometry] = await Promise.all([scripts.draft(course.id, locale), scripts.packs(course.id), loadGeometry(env.FILES, course)]);
  const latest = packs.filter((p) => p.locale === locale).reduce((max, p) => Math.max(max, p.version), 0);
  const version = draft?.version ?? latest + 1;
  return {
    script: draft?.script ?? emptyScript(course.id, locale, version),
    version,
    updatedAt: draft?.updatedAt ?? null,
    geometry,
    track: trackFor(geometry),
    packs,
  };
};

/** The newest published pack of the context's locale, or null. */
export const lastPackOf = (ctx: Pick<StudioContext, 'packs' | 'script'>): PackSummary | null => ctx.packs.find((p) => p.locale === ctx.script.locale) ?? null;

/** The estimates for a script in its context: what every studio JSON answer carries. */
export const estimatesFor = (env: Bindings, course: Course, ctx: StudioContext, script: AudioScript, paceSecPerKm: number, timezone: string, updatedAt = ctx.updatedAt) =>
  studioEstimates({ files: env.FILES, lastPack: lastPackOf(ctx), updatedAt, timezone }, script, course.distanceM, ctx.track, paceSecPerKm);

export const paceFromQuery = (raw: string | undefined): number => {
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 120 && seconds <= 1200 ? Math.round(seconds) : DEFAULT_PACE_SEC_PER_KM;
};

/** Everything the studio page renders, in one object; the same shape rides to the browser. */
export const studioPageData = async (
  env: Bindings,
  course: Course,
  ctx: StudioContext,
  paceSecPerKm: number,
  view: { timezone: string; canEdit: boolean },
): Promise<StudioPageData> => {
  const estimates = await estimatesFor(env, course, ctx, ctx.script, paceSecPerKm, view.timezone);
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
    packs: ctx.packs,
    mapboxToken: env.MAPBOX_TOKEN ?? null,
    ttsReady: Boolean(env.ELEVENLABS_API_TOKEN),
    canEdit: view.canEdit,
    script: ctx.script,
  };
};

/** One course card on the courses page: the trace, the announcements, the publication. */
export type CourseAudioCard = {
  course: Course;
  measuredM: number | null;
  summary: AudioSummary;
};

export const courseAudioCard = async (env: Bindings, course: Course): Promise<CourseAudioCard> => {
  const ctx = await loadStudioContext(env, course);
  const lines = await lineStatuses(env.FILES, ctx.script, course.distanceM);
  return {
    course,
    measuredM: ctx.track ? Math.round(ctx.track.totalM) : null,
    summary: await audioSummary(ctx.script, lines, lastPackOf(ctx), ctx.updatedAt),
  };
};
