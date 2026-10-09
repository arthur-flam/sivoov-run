import {
  AudioScriptSchema,
  CourseGeometrySchema,
  MOMENTS,
  buildTrack,
  lineIssues,
  personalPhase,
  upgradeScript,
  decimate,
  estimateFirings,
  momentOf,
  nearestOnTrack,
  positionForRun,
  publishedContent,
  runMetersForTrack,
  stripAudioTags,
  voiceOfLine,
  voicingsOf,
  whenInWords,
} from '@sivoov/shared';
import type {
  AudioScript,
  CeremonyIssue,
  Course,
  CourseGeometry,
  CourseTrack,
  CueMoment,
  EstimatedFiring,
  LatLng,
  LineIssue,
  Moment,
  PlaceholderPhase,
  ScriptLine,
  ScriptTake,
  Voicing,
} from '@sivoov/shared';
import type { Bindings } from '../env';
import { scriptDb } from '../db/scriptQueries';
import type { PackSummary } from '../db/scriptQueries';
import { TAKES_COPY, TAKE_WHEN_COPY, ceremonyIssueText, issueText, lineStatusView, lineVoiceText, publishView, summaryText, takeIssueText, takeName } from '../pages/org/studioCopy';
import type { AudioSummary, LineSource } from '../pages/org/studioCopy';
import type { Tone } from '../pages/org/ui';
import { checkCeremony } from './ceremonyChecks';
import { sha256Hex } from './crypto';
import { canRender, renderKey, ttsDepsFor, ttsHash } from './tts';
import { uploadKey } from './uploads';
import { DEFAULT_VOICE, voiceSummary } from './voices';

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
 * One of a line's takes, as the studio shows it under the line (display only: takes are written
 * by the production tool): its words (or its file), its condition in the organizer's words, its
 * personal version, and its sound once recorded (`audioPath`, as for a line).
 */
export type TakeStatus = {
  id: string;
  /** « Variante b ». */
  name: string;
  /** What everyone hears: its words without voice tags, or « Votre fichier : cloche.mp3 ». */
  text: string;
  /** Its condition read from the run (« après un arrêt »), or null for a take said any time. */
  when: string | null;
  /** « Personnalisée » and its sentence (or the AI's instructions), when it has a personal version. */
  personal: { label: string; text: string } | null;
  /** Read by the voice (no file of its own): « Enregistrer la voix » records it with the line. */
  voiced: boolean;
  rendered: boolean;
  audioPath: string | null;
};

/**
 * Per line: where its sound comes from, whether that sound is ready for the current text, what
 * still stops it from going out, when it plays in plain words and under which moment the
 * studio lists it. `audioPath` is where "Écouter" fetches it, relative to the course's studio
 * URL; null means the browser reads the text. A personal line's sound is its offline version.
 * A line with takes is ready once every take is, and lists them (`takes`).
 */
export type LineStatus = {
  id: string;
  source: LineSource;
  /** Personal lines: how the runner's version is made and when. */
  personal: { kind: 'template' | 'ai'; phase: PlaceholderPhase } | null;
  /** The start ceremony's moment and order, for the départ strip. */
  cue: { at: CueMoment; order: number } | null;
  /** Voice: the TTS cache hash of the current text. Upload: the file's sha256. */
  hash: string;
  /** The sound is ready: the voice rendered for this exact text (and every take's), or the uploaded file stored. */
  rendered: boolean;
  bytes: number;
  issues: LineIssue[];
  /** What the start ceremony's checks say about this line: warnings, publishing goes ahead. */
  ceremony: CeremonyIssue[];
  /** The issues, then the ceremony's warnings, in the organizer's words (studioCopy `issueText`, `ceremonyIssueText`). */
  problems: string[];
  when: string;
  moment: Moment;
  audioPath: string | null;
  label: string;
  tone: Tone;
  /** « Voix : Fenrir » when someone else than the course's voice says the line. */
  voice: string | null;
  takes: TakeStatus[];
};

const sourceOf = (line: ScriptLine): LineSource => (line.audio ? 'upload' : line.personal ? 'personal' : 'voice');

type Sound = { hash: string; ready: boolean; bytes: number; audioPath: string | null };

/** Where one way of saying the line is heard: its upload, or the line's voice reading its words (none to read: not ready). */
const soundOf = async (files: R2Bucket, script: AudioScript, line: ScriptLine, v: Voicing): Promise<Sound> => {
  if (v.audio) {
    const head = await files.head(uploadKey(v.audio));
    return { hash: v.audio.hash, ready: head !== null, bytes: v.audio.bytes, audioPath: head ? `/uploads/${v.audio.hash}.${v.audio.format}` : null };
  }
  const voice = voiceOfLine(script, line);
  const hash = await ttsHash(voice, v.text);
  const head = v.text.trim().length === 0 ? null : await files.head(renderKey(voice, hash));
  return { hash, ready: head !== null, bytes: head?.size ?? 0, audioPath: head ? `/audio/${hash}` : null };
};

const takePersonal = ({ personal }: ScriptTake): TakeStatus['personal'] =>
  !personal ? null : personal.kind === 'template' ? { label: TAKES_COPY.personal, text: personal.template } : { label: TAKES_COPY.ai, text: personal.prompt };

const takeStatus = async (files: R2Bucket, script: AudioScript, line: ScriptLine, take: ScriptTake, v: Voicing): Promise<TakeStatus> => {
  const sound = await soundOf(files, script, line, v);
  return {
    id: take.id,
    name: takeName(take.id),
    text: take.audio ? `${TAKES_COPY.file} : ${take.audio.name || 'son importé'}` : stripAudioTags(take.text),
    when: take.when ? TAKE_WHEN_COPY[take.when] : null,
    personal: takePersonal(take),
    voiced: !take.audio,
    rendered: sound.ready,
    audioPath: sound.audioPath,
  };
};

/** An issue in the organizer's words; a take's names the take (« Variante b : … »). */
const problemOf = (line: ScriptLine, issue: LineIssue): string => {
  const take = issue.take;
  if (!take) return issueText(issue, Boolean(line.personal));
  return takeIssueText({ ...issue, take }, Boolean(line.takes?.find((t) => t.id === take)?.personal));
};

const lineStatus = async (files: R2Bucket, script: AudioScript, line: ScriptLine, officialM: number): Promise<LineStatus> => {
  const source = sourceOf(line);
  const issues = lineIssues(line);
  const toWrite = issues.some((i) => i.code === 'no_text' && !i.take);
  const toFix = issues.some((i) => i.code !== 'no_text' || i.take);
  const phase = personalPhase(line);
  const [own, ...others] = voicingsOf(line);
  const [sound, takes] = await Promise.all([
    soundOf(files, script, line, own!),
    Promise.all((line.takes ?? []).map((t, i) => takeStatus(files, script, line, t, others[i]!))),
  ]);
  const ready = sound.ready && takes.every((t) => t.rendered);
  return {
    id: line.id,
    source,
    personal: line.personal && phase ? { kind: line.personal.kind, phase } : null,
    cue: line.trigger.kind === 'cue' ? { at: line.trigger.at, order: line.trigger.order } : null,
    hash: sound.hash,
    rendered: ready,
    bytes: sound.bytes,
    issues,
    ceremony: [],
    problems: issues.map((i) => problemOf(line, i)),
    when: whenInWords(line.trigger),
    moment: momentOf(line.trigger, officialM),
    audioPath: sound.audioPath,
    ...lineStatusView(source, { ready, toWrite, toFix }),
    voice: line.voice ? lineVoiceText(voiceOfLine(script, line).name) : null,
    takes,
  };
};

export const lineStatuses = async (files: R2Bucket, script: AudioScript, officialM: number): Promise<LineStatus[]> => {
  const [statuses, ceremony] = await Promise.all([Promise.all(script.lines.map((line) => lineStatus(files, script, line, officialM))), checkCeremony(files, script)]);
  return statuses.map((s) => {
    const found = ceremony[s.id] ?? [];
    return found.length === 0 ? s : { ...s, ceremony: found, problems: [...s.problems, ...found.map(ceremonyIssueText)] };
  });
};

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
  const toFix = lines.filter((l) => l.issues.length > 0).length;
  const toRecord = lines.filter((l) => l.issues.length === 0 && !l.rendered).length;
  const fingerprint = await scriptFingerprint(script);
  const changed =
    script.lines.length > 0 &&
    (script.published ? script.published.fingerprint !== fingerprint : lastPack ? updatedAt === null || updatedAt > lastPack.createdAt : true);
  return {
    lines: lines.length,
    toRecord,
    toFix,
    uploads: lines.filter((l) => l.source === 'upload').length,
    personal: lines.filter((l) => l.source === 'personal').length,
    lastPublished: lastPack ? { version: lastPack.version, at: lastPack.createdAt } : null,
    changed,
    publish: script.lines.length === 0 ? 'empty' : toFix > 0 ? 'fix' : toRecord > 0 ? 'missing' : changed ? 'ready' : 'current',
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
  /** The AI Gateway is configured: AI personal lines get written, « Proposer un texte » works. */
  aiReady: boolean;
  /** "George · Expressive (Eleven v3) · Naturelle". */
  voiceLabel: string;
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
    // Scripts written before personal lines are read in today's shape (upgradeScript).
    script: draft ? upgradeScript(draft.script) : emptyScript(course.id, locale, version),
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
    mapboxToken: env.MAPBOX_TOKEN || null,
    ttsReady: canRender(ttsDepsFor(env), ctx.script.voice),
    aiReady: Boolean(env.CLOUDFLARE_AI_TOKEN && env.AI_GATEWAY),
    voiceLabel: voiceSummary(ctx.script.voice),
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
