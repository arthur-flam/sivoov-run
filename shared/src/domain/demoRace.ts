import { RaceSchema } from '../schemas/race';
import type { DistanceKey, Race } from '../schemas/race';
import type { Entrant } from '../schemas/entrant';
import type { Course } from '../schemas/course';

/**
 * A demo race: what an organizer's testers and App Review run. It copies the real race's name,
 * dates and look, lives at its own address with its own runners and results, and stays open, so
 * it can be run on any day. Its courses and sound are the real race's (the Worker reads them
 * through `demoOf`), so it always plays what was last published there.
 */

/** How long a new demo stays open: a sales season and a few App Store reviews. */
export const DEMO_OPEN_DAYS = 730;
const DAY_MS = 24 * 60 * 60 * 1000;

export const demoSlugFor = (source: Pick<Race, 'slug'>): string => `${source.slug}-demo`;

/** The courses a race's public pages show: a demo course only on the demo race. */
export const coursesShown = <C extends Pick<Course, 'demo'>>(race: Pick<Race, 'demoOf'>, courses: C[]): C[] => (race.demoOf ? courses : courses.filter((c) => !c.demo));

/** A demo of a demo would borrow courses from a race that has none of its own. */
export const canHaveDemo = (race: Pick<Race, 'demoOf'>): boolean => !race.demoOf;

/**
 * The demo of `source`, new (`existing` null) or brought up to date: the look, names and dates
 * follow the real race again; the demo keeps its own id, address and window. It is always open.
 */
export const demoRaceFor = (source: Race, existing: Race | null, id: string, now: Date): Race =>
  RaceSchema.parse({
    ...source,
    id: existing?.id ?? id,
    slug: existing?.slug ?? demoSlugFor(source),
    windowStart: existing?.windowStart ?? new Date(now.getTime() - DAY_MS).toISOString(),
    windowEnd: existing?.windowEnd ?? new Date(now.getTime() + DEMO_OPEN_DAYS * DAY_MS).toISOString(),
    status: 'open',
    demoOf: source.id,
  });

/**
 * App Review's runner. An `@example.com` address has no inbox, so nobody can receive its code:
 * it signs in only with the review code, and only on a demo race (`api/src/lib/testCode.ts`).
 */
export const REVIEW_EMAIL = 'review@example.com';
export const REVIEW_BIB = '9999';

export const reviewEntrantFor = (demo: Pick<Race, 'id'>, distanceKey: DistanceKey, id: string): Entrant => ({
  id,
  raceId: demo.id,
  bib: REVIEW_BIB,
  email: REVIEW_EMAIL,
  firstName: 'Camille',
  lastName: 'Martin',
  distanceKey,
  source: 'manual',
});

/** The demo's simulated run lasts about this long, whatever the distance. */
export const DEMO_RUN_MINUTES = 10;
/** The pace the simulated runner holds, seconds per km. */
export const DEMO_PACE_S_PER_KM = 300;

/**
 * How much faster than life the demo plays a course so that it lasts `DEMO_RUN_MINUTES`: a
 * 10 km about 5x, a marathon about 21x. Never slower than life.
 */
export const demoSpeedFor = (distanceM: number): number => {
  const coveredInLifeM = ((DEMO_RUN_MINUTES * 60) / DEMO_PACE_S_PER_KM) * 1000;
  return Math.max(1, Math.round((distanceM / coveredInLifeM) * 10) / 10);
};
