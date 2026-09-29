import { REVIEW_BIB, canHaveDemo, demoRaceFor, demoSlugFor, reviewEntrantFor } from '@sivoov/shared';
import type { Race } from '@sivoov/shared';
import type { Bindings } from '../env';
import { db } from '../db/queries';
import { newId, randomHex } from './crypto';

export type DemoOutcome = { ok: true; demo: Race; created: boolean } | { ok: false; error: 'is_demo' };

/**
 * « Créer la démo » / « Mettre à jour la démo » (staff, a race's settings): the race's demo, new
 * or with the real race's look again (`demoRaceFor`), and App Review's runner on its shortest
 * course. Its runners are added by hand in its own Coureurs page; its courses and sound are the
 * real race's, read through `demo_of`, so nothing is copied and nothing needs syncing.
 */
export const makeDemo = async (env: Bindings, source: Race, now: Date = new Date()): Promise<DemoOutcome> => {
  if (!canHaveDemo(source)) return { ok: false, error: 'is_demo' };
  const q = db(env.DB);
  const existing = await q.demoFor(source.id);
  const taken = existing ? null : await q.raceBySlug(demoSlugFor(source));
  const base = demoRaceFor(source, existing, newId(), now);
  // Another race already has the natural address: a short suffix keeps the demo reachable.
  const demo = taken ? { ...base, slug: `${base.slug}-${randomHex(2)}` } : base;
  await q.upsertRace(demo);
  const shortest = (await q.coursesForRace(demo.id)).at(-1);
  if (shortest && !(await q.entrantByBib(demo.id, REVIEW_BIB))) await q.upsertEntrant(reviewEntrantFor(demo, shortest.distanceKey, newId()));
  return { ok: true, demo, created: !existing };
};
