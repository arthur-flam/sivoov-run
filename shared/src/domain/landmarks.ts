import { LandmarkSchema } from '../schemas/course';
import type { Landmark } from '../schemas/course';
import { kmInput, metersFromKm } from './audioEditor';

/**
 * "Les lieux du parcours": the places a course passes (name, km, a short line), shown on the
 * public race page and on the studio map. The organizer edits them as a plain list of rows;
 * these functions turn the rows into landmarks and back, and say what is wrong with a row.
 */

/** One row of the list, as typed. `id` is empty for a new row. */
export type LandmarkRow = { id: string; name: string; km: string; description: string };

export const LANDMARK_NAME_MAX = 80;
export const LANDMARK_DESCRIPTION_MAX = 200;

/** The rows the form shows for stored landmarks. */
export const landmarkRows = (landmarks: Landmark[]): LandmarkRow[] =>
  landmarks.map((l) => ({ id: l.id, name: l.name, km: kmInput(l.meters), description: l.description ?? '' }));

/** "Hippodrome de la Touques" -> "hippodrome-de-la-touques". */
export const landmarkSlug = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'lieu';

/** The first id not taken: `touques`, then `touques-2`, `touques-3`... */
const uniqueId = (wanted: string, taken: ReadonlySet<string>): string =>
  taken.has(wanted) ? (Array.from({ length: taken.size + 1 }, (_, i) => `${wanted}-${i + 2}`).find((id) => !taken.has(id)) ?? `${wanted}-x`) : wanted;

export type LandmarksOutcome = { ok: true; landmarks: Landmark[] } | { ok: false; errors: Record<number, string> };

const blank = (row: LandmarkRow) => row.name.trim() === '' && row.km.trim() === '' && row.description.trim() === '';

/**
 * The landmarks from the rows. A row left empty is dropped (that is how one is removed); any
 * other row needs a name and a km within the course. Errors are keyed by row index, in the
 * organizer's words. Landmarks come back in course order, ids kept or made from the name.
 */
export const landmarksFromRows = (rows: LandmarkRow[], officialM: number): LandmarksOutcome => {
  const errorOf = (row: LandmarkRow): string | null => {
    const meters = metersFromKm(row.km);
    if (row.name.trim() === '') return 'Donnez un nom à ce lieu, ou videz la ligne pour le retirer.';
    if (row.name.trim().length > LANDMARK_NAME_MAX) return `Un nom de ${LANDMARK_NAME_MAX} caractères au plus.`;
    // Names end up in map tooltips and pages: markup has no business in them.
    if (/[<>]/.test(row.name) || /[<>]/.test(row.description)) return 'Sans les signes < et >, s’il vous plaît.';
    if (meters === null) return 'Écrivez le kilomètre, par exemple 5,2.';
    if (meters > officialM) return `Ce kilomètre est après l’arrivée (${kmInput(officialM)} km).`;
    if (row.description.trim().length > LANDMARK_DESCRIPTION_MAX) return `Une description de ${LANDMARK_DESCRIPTION_MAX} caractères au plus.`;
    return null;
  };
  const indexed = rows.map((row, index) => ({ row, index })).filter(({ row }) => !blank(row));
  const errors = Object.fromEntries(
    indexed.map(({ row, index }) => [index, errorOf(row)] as const).filter((e): e is readonly [number, string] => e[1] !== null),
  );
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const landmarks = indexed
    .map(({ row }) => row)
    .reduce<Landmark[]>((acc, row) => {
      const taken = new Set(acc.map((l) => l.id));
      const id = uniqueId(row.id.trim() || landmarkSlug(row.name), taken);
      const description = row.description.trim();
      return [...acc, LandmarkSchema.parse({ id, name: row.name.trim(), meters: metersFromKm(row.km)!, ...(description ? { description } : {}) })];
    }, []);
  return { ok: true, landmarks: [...landmarks].sort((a, b) => a.meters - b.meters) };
};
