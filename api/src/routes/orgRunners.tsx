import { Hono } from 'hono';
import { formatOfficialTime, parseEntrantsCsv, toCsv } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { runnerDb } from '../db/runnerQueries';
import { requireCan, requireOrganizer } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { OrgImportPage } from '../pages/org/import';
import type { ImportOutcome } from '../pages/org/import';
import { OrgRunnersPage } from '../pages/org/runners';
import { orgPage } from './orgPage';
import type { OrgContext } from './orgPage';

/** Runners: the list, the import, the downloads. Mounted under /org. */
export const orgRunners = new Hono<AppEnv & { Variables: OrgVars }>();

orgRunners.get('/:slug/runners', requireOrganizer, async (c) => {
  const race = c.get('race');
  const search = c.req.query('q') ?? '';
  const rows = await runnerDb(c.env.DB).entrantsWithBest(race.id, search);
  return orgPage(c, 'runners', 'Coureurs', <OrgRunnersPage race={race} access={c.get('access')} rows={rows} search={search} />);
});

const importPage = (c: OrgContext, outcome?: ImportOutcome) =>
  orgPage(c, 'runners', 'Importer des coureurs', <OrgImportPage race={c.get('race')} outcome={outcome} />);

orgRunners.get('/:slug/runners/import', requireOrganizer, requireCan('edit_runners'), (c) => importPage(c));
// The address the first admin used; kept so old links and bookmarks land on the new page.
orgRunners.get('/:slug/import', (c) => c.redirect(`/org/${c.req.param('slug')}/runners/import`, 301));

/** Multipart file or a pasted textarea; the parser reports every rejected line, the rest is upserted on (race, bib). */
orgRunners.post('/:slug/runners/import', requireOrganizer, requireCan('edit_runners'), async (c) => {
  const form = await c.req.parseBody();
  const text = form.file instanceof File && form.file.size > 0 ? await form.file.text() : String(form.csv ?? '');
  const parsed = parseEntrantsCsv(text);
  const report = await runnerDb(c.env.DB).importEntrants(c.get('race').id, parsed.entrants);
  return importPage(c, { ...report, rejected: parsed.rejected });
});

const csvResponse = (c: OrgContext, name: string, text: string) =>
  c.body(text, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });

orgRunners.get('/:slug/export/entrants.csv', requireOrganizer, async (c) => {
  const race = c.get('race');
  const rows = await runnerDb(c.env.DB).entrantsWithBest(race.id);
  const csv = toCsv([
    ['bib', 'email', 'first_name', 'last_name', 'distance_key', 'best_time'],
    ...rows.map(({ entrant, bestMs }) => [entrant.bib, entrant.email, entrant.firstName, entrant.lastName, entrant.distanceKey, bestMs === null ? '' : formatOfficialTime(bestMs)]),
  ]);
  return csvResponse(c, `${race.slug}-inscrits.csv`, csv);
});

orgRunners.get('/:slug/export/results.csv', requireOrganizer, async (c) => {
  const race = c.get('race');
  const rows = await runnerDb(c.env.DB).resultRows(race.id);
  const csv = toCsv([
    ['bib', 'name', 'course', 'elapsed', 'elapsed_ms', 'distance_m', 'status', 'finished_at'],
    ...rows.map((r) => [
      r.bib, `${r.firstName} ${r.lastName.toUpperCase()}`, r.distanceKey,
      r.elapsedMs === null ? '' : formatOfficialTime(r.elapsedMs), r.elapsedMs, r.distanceM === null ? '' : Math.round(r.distanceM),
      r.status ?? 'not_started', r.finishedAt,
    ]),
  ]);
  return csvResponse(c, `${race.slug}-resultats.csv`, csv);
});
