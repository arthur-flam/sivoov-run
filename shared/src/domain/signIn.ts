import type { Race } from '../schemas/race';

/** One entry an email holds: the bib and the race it is in. */
export type EmailEntry = { entrant: { bib: string }; race: Pick<Race, 'slug' | 'theme'> };

export type EntryChoice<T> =
  | { kind: 'one'; entry: T }
  | { kind: 'none' }
  /** More than one entry: pick a race among `races` (when they differ), else ask for the bib. */
  | { kind: 'ambiguous'; races: Array<{ slug: string; name: string }>; bib: boolean };

/**
 * Which entry a sign-in means. The email alone decides almost always; the race narrows it when
 * the email is entered in more than one, and the bib when two entries of one race share it
 * (a family on one address). A race or a bib that matches nothing means no entry at all.
 */
export const whichEntry = <T extends EmailEntry>(entries: readonly T[], ask: { raceSlug?: string; bib?: string }): EntryChoice<T> => {
  const inRace = ask.raceSlug ? entries.filter((e) => e.race.slug === ask.raceSlug) : entries;
  const matching = ask.bib ? inRace.filter((e) => e.entrant.bib === ask.bib) : inRace;
  const [first] = matching;
  if (!first) return { kind: 'none' };
  if (matching.length === 1) return { kind: 'one', entry: first };
  const races = matching
    .map((e) => ({ slug: e.race.slug, name: e.race.theme.displayName }))
    .filter((r, i, all) => all.findIndex((o) => o.slug === r.slug) === i);
  return races.length > 1 ? { kind: 'ambiguous', races, bib: false } : { kind: 'ambiguous', races: [], bib: true };
};
