import type { Course, Entrant, Locale, Race, Run } from '@sivoov/shared';
import { distanceLabel, formatOfficialTime, t, windowPhase } from '@sivoov/shared';
import type { Db } from '../db/queries';
import { fmtDate } from '../pages/dates';
import type { CardRunner } from '../pages/card';

/** An entrant's standing: their best ranked run, its rank, and how many have finished. */
export type RunnerResult = { entrant: Entrant; course: Course; best: { run: Run; rank: number; total: number } | null };

type Timed = { run: Pick<Run, 'elapsedMs'> };

/** Equal times share a rank: two runners on 1:45:16 are both 2nd, the next one is 4th. */
export const rankOf = (rows: Timed[], elapsedMs: number): number => rows.filter((r) => r.run.elapsedMs < elapsedMs).length + 1;

/** The same rule for a whole table already sorted by time: a tie takes the rank of its first. */
export const ranks = (rows: Timed[]): number[] => {
  const firstOfTie = (i: number): number => (i > 0 && rows[i - 1]!.run.elapsedMs === rows[i]!.run.elapsedMs ? firstOfTie(i - 1) : i);
  return rows.map((_, i) => firstOfTie(i) + 1);
};

export const resultForBib = async (q: Db, race: Race, bib: string): Promise<RunnerResult | null> => {
  const entrant = await q.entrantByBib(race.id, bib);
  const course = entrant ? await q.courseFor(race.id, entrant.distanceKey) : null;
  if (!entrant || !course) return null;
  const rows = await q.resultsForCourse(course.id);
  const mine = rows.find((r) => r.entrant.id === entrant.id);
  return { entrant, course, best: mine ? { run: mine.run, rank: rankOf(rows, mine.run.elapsedMs), total: rows.length } : null };
};

export const fullName = (entrant: Pick<Entrant, 'firstName' | 'lastName'>): string => `${entrant.firstName} ${entrant.lastName.toUpperCase()}`;

/**
 * Before a finish, a bib page shows "Paul B.": bibs are sequential, and full names on pages
 * nobody chose to publish would hand out the entrant list. A finish is public, like any result.
 */
export const shortName = (entrant: Pick<Entrant, 'firstName' | 'lastName'>): string => `${entrant.firstName} ${entrant.lastName.charAt(0).toUpperCase()}.`;

/** The day the line was crossed, in the race's timezone. */
export const runDate = (race: Race, run: Run, locale: Locale): string =>
  fmtDate(run.finishedAt ?? run.startedAt ?? race.windowEnd, locale, race.timezone, { day: 'numeric', month: 'long', year: 'numeric' });

export const finisherCard = (race: Race, entrant: Entrant, run: Run, locale: Locale): CardRunner => ({
  label: t(locale, 'card.finisher'),
  name: fullName(entrant),
  big: formatOfficialTime(run.elapsedMs),
  meta: `${distanceLabel(locale, entrant.distanceKey)} · ${runDate(race, run, locale)}`,
});

/** Before the finish: the bib, for the runner who tells friends they are in. */
export const bibCard = (race: Race, entrant: Entrant, locale: Locale): CardRunner => ({
  label: t(locale, 'card.bib'),
  name: shortName(entrant),
  big: entrant.bib,
  meta: `${distanceLabel(locale, entrant.distanceKey)} · ${fmtDate(race.windowStart, locale, race.timezone, { day: 'numeric' })} → ${fmtDate(race.windowEnd, locale, race.timezone)}`,
});

/** A card is taken once per run and language: a better run later is a new card. */
export const runCardId = (run: Run, locale: Locale): string => `${run.id}-${locale}`;
export const bibCardId = (entrant: Entrant, locale: Locale): string => `bib-${entrant.id}-${locale}`;
export const raceCardId = (race: Race, locale: Locale): string => `race-${race.id}-${locale}`;

/**
 * The card a runner's page shows and shares: the finisher card once there is an official time,
 * the bib card until the window closes, none after that.
 */
export const runnerCardFor = (race: Race, result: RunnerResult, locale: Locale, nowMs: number): { id: string; card: CardRunner } | null => {
  if (result.best) return { id: runCardId(result.best.run, locale), card: finisherCard(race, result.entrant, result.best.run, locale) };
  if (windowPhase(race, nowMs) === 'after') return null;
  return { id: bibCardId(result.entrant, locale), card: bibCard(race, result.entrant, locale) };
};
