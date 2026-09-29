import type { Course } from '../schemas/course';
import type { CourseMoment, PhotoMoment, RunnerPhoto } from '../schemas/photo';
import type { Run } from '../schemas/run';
import type { ScriptLine } from '../schemas/audioScript';
import { elapsedAt } from './raceReport';

/**
 * Photo moments, pure: where each falls on a course, which one the runner is at, how many
 * times a picture may be made, and what the image model is asked for.
 */

/** A moment's distance on this course: 0 at the start, the official distance at the finish, a place's own distance, or null when the course does not pass there. */
export const momentMeters = (at: string, course: Pick<Course, 'distanceM' | 'landmarks'>): number | null => {
  if (at === 'start') return 0;
  if (at === 'finish') return course.distanceM;
  const place = course.landmarks.find((l) => l.id === at);
  return place ? Math.min(place.meters, course.distanceM) : null;
};

/** The race's moments on one course, in course order; the ones it does not pass are left out. */
export const courseMoments = (moments: readonly PhotoMoment[], course: Pick<Course, 'distanceM' | 'landmarks'>): CourseMoment[] =>
  moments
    .map((m) => ({ m, meters: momentMeters(m.at, course) }))
    .filter((x): x is { m: PhotoMoment; meters: number } => x.meters !== null)
    .sort((a, b) => a.meters - b.meters || a.m.sort - b.m.sort)
    .map(({ m, meters }) => ({ id: m.id, title: m.title, ask: m.ask, meters }));

/** How far past a moment the run screen still shows it: time to slow down and take the picture. */
export const MOMENT_SHOWN_M = 500;

/**
 * The moment the runner is at now, while running: from 50 m before it to `MOMENT_SHOWN_M`
 * after; of two that overlap, the one reached last. The start's is taken on the line (the ready
 * screen) and the finish's after it (the finish screen): neither is one here.
 */
export const momentAt = (moments: readonly CourseMoment[], distanceM: number, officialM: number): CourseMoment | null =>
  moments
    .filter((m) => m.meters > 0 && m.meters < officialM && distanceM >= m.meters - 50 && distanceM <= m.meters + MOMENT_SHOWN_M)
    .reduce<CourseMoment | null>((last, m) => (last === null || m.meters > last.meters ? m : last), null);

/** A runner may have a picture made this many times per moment (the first and two more tries). */
export const MAX_PHOTO_ATTEMPTS = 3;

/** A picture still "rendering" after this long was lost (the page closed, the Worker stopped): it may be asked again. */
export const RENDER_STALE_MS = 3 * 60_000;

export const isStale = (photo: Pick<RunnerPhoto, 'status' | 'updatedAt'>, nowMs: number): boolean =>
  photo.status === 'rendering' && nowMs - Date.parse(photo.updatedAt) > RENDER_STALE_MS;

/** Another picture may be made: tries left, and none being made now (a lost one does not count). */
export const canTryAgain = (photo: Pick<RunnerPhoto, 'attempts' | 'status' | 'updatedAt'>, nowMs: number): boolean =>
  (photo.status !== 'rendering' || isStale(photo, nowMs)) && photo.attempts < MAX_PHOTO_ATTEMPTS;

type PromptInput = { raceName: string; city: string; title: string; scene: string; bib: string; refs: number; finish: boolean };

/**
 * What the image model is asked, in English (the models follow it best): the person from the
 * first photo, in this place of this race, running with their bib. Their face and body are
 * theirs, the rest is the race. Pictures after the first are the organizer's photos of the place.
 */
export const remixPrompt = ({ raceName, city, title, scene, bib, refs, finish }: PromptInput): string =>
  [
    `Create a photorealistic photo, as taken by the official race photographer, of the person in the first image running the ${raceName} in ${city}.`,
    `The moment: ${title}. ${scene}`,
    refs > 0 ? `The next ${refs === 1 ? 'image shows' : `${refs} images show`} the real place: match its architecture, colours and light closely.` : null,
    finish ? 'They are crossing the finish line, arms up, with the joy of a finisher.' : 'They are running with a strong, happy stride among other runners, spectators cheering behind barriers.',
    `They wear a race bib pinned to their chest with the number ${bib} printed large and legible.`,
    'Keep the person exactly recognisable: same face, features, skin tone, hair, age and body shape. Dress them in running clothes that match their photo if it shows sportswear, otherwise in a plain running shirt and shorts.',
    'Natural colours, real depth of field, no text other than the bib number, no watermark, no frame. Portrait orientation.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

/**
 * When a photo was taken, from its EXIF: `DateTimeOriginal` ("2026:11:12 08:31:05") is the
 * phone's local time; `OffsetTimeOriginal` ("+01:00") says which, else the phone's own offset
 * now (`offsetMinutes`, east of UTC positive). iOS nests the fields under "{Exif}". Null without.
 */
export const exifTakenAt = (exif: Record<string, unknown> | null | undefined, offsetMinutes: number): number | null => {
  const nested = exif?.['{Exif}'];
  const fields = { ...(nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : {}), ...(exif ?? {}) };
  const when = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(fields.DateTimeOriginal ?? fields.DateTime ?? ''));
  if (!when) return null;
  const [, y, mo, d, h, mi, sec] = when.map(Number) as [number, number, number, number, number, number, number];
  const zone = /^([+-])(\d{2}):?(\d{2})$/.exec(String(fields.OffsetTimeOriginal ?? fields.OffsetTime ?? ''));
  const offset = zone ? (zone[1] === '-' ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3])) : offsetMinutes;
  return Date.UTC(y, mo - 1, d, h, mi, sec) - offset * 60_000;
};

/** When the runner passed each moment on this run: the gun for the start, the line for the finish, the splits between. */
export const momentPasses = (moments: readonly CourseMoment[], run: Pick<Run, 'elapsedMs' | 'splits'> & { startedAtMs: number }, officialM: number): Array<{ momentId: string; atMs: number }> =>
  moments
    .map((m) => ({ momentId: m.id, elapsed: m.meters <= 0 ? 0 : elapsedAt(run, officialM, m.meters) }))
    .filter((p): p is { momentId: string; elapsed: number } => p.elapsed !== null)
    .map((p) => ({ momentId: p.momentId, atMs: run.startedAtMs + p.elapsed }));

/** How far from the moment a photo still belongs to it: the runner slows down, finds the phone, tries twice. */
export const PHOTO_MATCH_MS = 20 * 60_000;
/** The start's photo may be taken on the line well before the gun; the finish's long after, at home. */
export const START_PHOTO_BEFORE_MS = 90 * 60_000;
export const FINISH_PHOTO_AFTER_MS = 6 * 60 * 60_000;

type Picked = { id: string; takenAtMs: number | null };

/**
 * Which picked photo goes with which moment: each moment takes the photo taken closest to
 * when the runner passed it (the start's may be earlier, the finish's later), one photo per
 * moment. Photos with no time left over fill the moments still empty, in course order.
 * Returns momentId → photo id.
 */
export const assignPhotos = (photos: readonly Picked[], passes: ReadonlyArray<{ momentId: string; atMs: number }>, moments: readonly CourseMoment[], officialM: number): Map<string, string> => {
  const kind = new Map(moments.map((m) => [m.id, m.meters <= 0 ? 'start' : m.meters >= officialM ? 'finish' : 'course']));
  const distance = (photo: number, pass: { momentId: string; atMs: number }): number | null => {
    const gap = photo - pass.atMs;
    const k = kind.get(pass.momentId);
    if (k === 'start' && gap < 0) return -gap <= START_PHOTO_BEFORE_MS ? -gap : null;
    if (k === 'finish' && gap > 0) return gap <= FINISH_PHOTO_AFTER_MS ? gap / 10 : null;
    return Math.abs(gap) <= PHOTO_MATCH_MS ? Math.abs(gap) : null;
  };
  const pairs = photos
    .flatMap((p) => (p.takenAtMs === null ? [] : passes.map((pass) => ({ photo: p.id, moment: pass.momentId, d: distance(p.takenAtMs!, pass) }))))
    .filter((x): x is { photo: string; moment: string; d: number } => x.d !== null)
    .sort((a, b) => a.d - b.d);
  const timed = pairs.reduce((chosen, x) => {
    const used = [...chosen.values()];
    return chosen.has(x.moment) || used.includes(x.photo) ? chosen : new Map([...chosen, [x.moment, x.photo]]);
  }, new Map<string, string>());
  const untimed = photos.filter((p) => p.takenAtMs === null).map((p) => p.id);
  const empty = moments.map((m) => m.id).filter((id) => !timed.has(id));
  return new Map([...timed, ...empty.slice(0, untimed.length).map((id, i) => [id, untimed[i]!] as const)]);
};

/** A photo moment's announcement in a course's script: found by this id, so the studio knows it is there. */
export const photoLineId = (momentId: string): string => `photo.${momentId}`;

/**
 * The announcement that comes with a photo moment, ready for the organizer to reword: at the
 * start it is the last line before the countdown (the runner is on the line, phone in hand); at
 * the finish it waits for the finish call; elsewhere it plays at the place.
 */
export const photoLine = (moment: CourseMoment, courseId: string, officialM: number): ScriptLine => ({
  id: photoLineId(moment.id),
  title: `Moment photo : ${moment.title}`,
  category: 'course',
  mix: moment.meters >= officialM ? 'wait' : 'duck',
  priority: 6,
  once: true,
  trigger: moment.meters <= 0 ? { kind: 'cue', at: 'armed', order: 90 } : moment.meters >= officialM ? { kind: 'finish' } : { kind: 'distance', meters: Math.round(moment.meters) },
  key: `${courseId}-photo-${moment.id}`.replace(/[^A-Za-z0-9._-]/g, '-'),
  text: `Moment photo ! ${moment.title}. ${moment.ask}`,
});

/** The course's photo moments, each with its announcement when the script has one. */
export const photoLinesOf = (moments: readonly CourseMoment[], lines: readonly Pick<ScriptLine, 'id' | 'title'>[]): Array<{ moment: CourseMoment; line: Pick<ScriptLine, 'id' | 'title'> | null }> =>
  moments.map((moment) => ({ moment, line: lines.find((l) => l.id === photoLineId(moment.id)) ?? null }));
