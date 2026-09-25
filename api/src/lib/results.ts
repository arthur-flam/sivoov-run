import type { Course, Entrant, Locale, Race, Run } from '@sivoov/shared';
import { distanceLabel, formatOfficialTime, t, windowPhase } from '@sivoov/shared';
import type { Db } from '../db/queries';
import { fmtDate } from '../pages/dates';
import type { CardRunner } from '../pages/card';

/** An entrant's standing: their best ranked run, its rank, and how many have finished. */
export type RunnerResult = { entrant: Entrant; course: Course; best: { run: Run; rank: number; total: number } | null };

export const resultForBib = async (q: Db, race: Race, bib: string): Promise<RunnerResult | null> => {
  const entrant = await q.entrantByBib(race.id, bib);
  const course = entrant ? await q.courseFor(race.id, entrant.distanceKey) : null;
  if (!entrant || !course) return null;
  const rows = await q.resultsForCourse(course.id);
  const index = rows.findIndex((r) => r.entrant.id === entrant.id);
  return { entrant, course, best: index < 0 ? null : { run: rows[index]!.run, rank: index + 1, total: rows.length } };
};

export const fullName = (entrant: Pick<Entrant, 'firstName' | 'lastName'>): string => `${entrant.firstName} ${entrant.lastName.toUpperCase()}`;

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
  name: fullName(entrant),
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
