import type { Course } from '../schemas/course';
import type { CourseMoment, PhotoMoment, RunnerPhoto } from '../schemas/photo';

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
 * after. The finish's moment is not one: the finish screen asks for it.
 */
export const momentAt = (moments: readonly CourseMoment[], distanceM: number, officialM: number): CourseMoment | null =>
  moments.find((m) => m.meters < officialM && distanceM >= m.meters - 50 && distanceM <= m.meters + MOMENT_SHOWN_M) ?? null;

/** A runner may have a picture made this many times per moment (the first and two more tries). */
export const MAX_PHOTO_ATTEMPTS = 3;

export const canTryAgain = (photo: Pick<RunnerPhoto, 'attempts' | 'status'>): boolean => photo.status !== 'rendering' && photo.attempts < MAX_PHOTO_ATTEMPTS;

/** A picture still "rendering" after this long was lost (the page closed, the Worker stopped): it may be asked again. */
export const RENDER_STALE_MS = 3 * 60_000;

export const isStale = (photo: Pick<RunnerPhoto, 'status' | 'updatedAt'>, nowMs: number): boolean =>
  photo.status === 'rendering' && nowMs - Date.parse(photo.updatedAt) > RENDER_STALE_MS;

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
