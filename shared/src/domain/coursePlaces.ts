import type { Landmark } from '../schemas/course';

/**
 * The race home's course card: the places the voice announces, lettered in course order so
 * they never read as kilometres, and the kilometre marks drawn along the line.
 */

export type PlaceMark = 'start' | 'finish' | string;
export type Place = { landmark: Landmark; mark: PlaceMark };

/** A, B ... Z, then AA, AB ... for a course with more places than letters. */
export const placeLetter = (index: number): string =>
  index < 26 ? String.fromCharCode(65 + index) : placeLetter(Math.floor(index / 26) - 1) + placeLetter(index % 26);

/** Start and finish carry their own marks; the places between are lettered in course order. */
export const coursePlaces = (landmarks: Landmark[], officialM: number): Place[] => {
  const sorted = [...landmarks].sort((a, b) => a.meters - b.meters);
  const between = sorted.filter((l) => l.meters > 0 && l.meters < officialM);
  return sorted.map((landmark) => ({
    landmark,
    mark: landmark.meters <= 0 ? 'start' : landmark.meters >= officialM ? 'finish' : placeLetter(between.indexOf(landmark)),
  }));
};

/** At most this many kilometre marks on the map: every km on a 10 km, fewer on longer courses. */
const MAX_KM_MARKS = 12;
const KM_STEPS = [1, 2, 5, 10];

/** Every how many kilometres the map is marked. */
export const kmMarkStep = (officialM: number): number => KM_STEPS.find((step) => officialM / 1000 / step <= MAX_KM_MARKS) ?? 10;

/** A mark this close to the finish would sit on it. */
const FINISH_GAP_M = 300;

/** The kilometres marked on the map, between the start and the finish. */
export const courseKmMarks = (officialM: number): number[] => {
  const step = kmMarkStep(officialM);
  return Array.from({ length: Math.floor(officialM / 1000 / step) }, (_, i) => (i + 1) * step).filter((km) => km * 1000 < officialM - FINISH_GAP_M);
};
