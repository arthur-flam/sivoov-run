import { Hono } from 'hono';
import { z } from 'zod';
import { DistanceKeySchema, EntrantSchema, decodeSpreadsheet, parseEntrantsCsv, parseRunnerEdit, parseRunnerInput, planImport, runnerFieldsFrom, runnerFieldsOf } from '@sivoov/shared';
import type { DistanceKey, Entrant } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { MAX_INSTRUCTIONS_PER_DAY, RUNNER_FILTERS, instructionsLog, runnerDb, sentInLastDay } from '../db/runnerQueries';
import type { RunnerQuery } from '../db/runnerQueries';
import { requireCan, requireOrganizer } from '../lib/orgAuth';
import type { OrgVars } from '../lib/orgAuth';
import { mailerFor } from '../lib/mailer';
import { instructionsEmail } from '../pages/emails';
import { distanceName, plural } from '../pages/org/format';
import { OrgImportPage } from '../pages/org/import';
import type { ImportProblem, ImportState } from '../pages/org/import';
import { OrgRunnerPage } from '../pages/org/runner';
import { entrantsCsv, medalsCsv, resultsCsv, templateCsv } from '../pages/org/runnerExports';
import { OrgRunnerFormPage } from '../pages/org/runnerForm';
import type { RunnerFormState } from '../pages/org/runnerForm';
import { windowText } from '../pages/org/runnerPresence';
import { OrgRunnersPage, runnerHref } from '../pages/org/runners';
import type { FlashMessage } from '../pages/org/runners';
import { Card, Empty, PageHead } from '../pages/org/ui';
import { orgPage } from './orgPage';
import type { OrgContext } from './orgPage';

/** Runners: the list, one runner, adding and editing, the import and the downloads. Mounted under /org. */
export const orgRunners = new Hono<AppEnv & { Variables: OrgVars }>();

/** `?filter=signed_in&distance=half&q=dur&page=2`; anything unexpected falls back to the default. */
const QuerySchema = z.object({
  filter: z.enum(RUNNER_FILTERS).catch('all'),
  distance: DistanceKeySchema.nullable().catch(null),
  q: z.string().trim().max(100).catch(''),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

const runnerQuery = (c: OrgContext): RunnerQuery => {
  const p = QuerySchema.parse({ filter: 'all', distance: null, q: '', page: 1, ...c.req.query() });
  return { filter: p.filter, distance: p.distance, search: p.q, page: p.page };
};

const count = (c: OrgContext, key: string): number => Math.max(0, Number.parseInt(c.req.query(key) ?? '0', 10) || 0);

const DONE: Record<string, FlashMessage> = {
  added: { tone: 'good', text: 'Coureur ajouté.' },
  added_notified: { tone: 'good', text: 'Coureur ajouté. Ses instructions sont parties par email.' },
  saved: { tone: 'good', text: 'Modifications enregistrées.' },
  deleted: { tone: 'good', text: 'Coureur supprimé.' },
  instructions_sent: { tone: 'good', text: 'Instructions envoyées par email.' },
  instructions_limit: { tone: 'warn', text: `Ce coureur a déjà reçu ${MAX_INSTRUCTIONS_PER_DAY} emails aujourd’hui. Réessayez demain.` },
  has_runs: { tone: 'bad', text: 'Ce coureur a déjà une activité : il ne peut pas être supprimé.' },
};

/** `?done=<key>` after a redirect -> the message; the import's carries its counts. */
const flashFor = (c: OrgContext): FlashMessage | undefined => {
  const done = c.req.query('done');
  if (done !== 'imported') return done ? DONE[done] : undefined;
  const refused = count(c, 'refused');
  return {
    tone: 'good',
    text: `Import terminé : ${plural(count(c, 'added'), 'coureur ajouté', 'coureurs ajoutés')}, ${count(c, 'updated')} mis à jour.${refused > 0 ? ` ${plural(refused, 'ligne refusée n’a', 'lignes refusées n’ont')} pas été importée${refused > 1 ? 's' : ''}.` : ''}`,
  };
};

const csvResponse = (c: OrgContext, name: string, text: string) =>
  c.body(text, 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });

// The list.
orgRunners.get('/:slug/runners', requireOrganizer, async (c) => {
  const race = c.get('race');
  const query = runnerQuery(c);
  const q = runnerDb(c.env.DB);
  const [{ rows, counts }, distances] = await Promise.all([q.list(race.id, query), q.distanceKeys(race.id)]);
  return orgPage(c, 'runners', 'Coureurs', <OrgRunnersPage race={race} access={c.get('access')} rows={rows} counts={counts} query={query} distances={distances} flash={flashFor(c)} />);
});

// Import: choose a file, see what it would do, confirm.
const importPage = (c: OrgContext, distances: DistanceKey[], state: ImportState, status: 200 | 400 = 200) =>
  orgPage(c, 'runners', 'Importer des coureurs', <OrgImportPage race={c.get('race')} distances={distances} state={state} />, { status });

orgRunners.get('/:slug/runners/import', requireOrganizer, requireCan('edit_runners'), async (c) => importPage(c, await runnerDb(c.env.DB).distanceKeys(c.get('race').id), { step: 'choose' }));
// The address the first admin used; kept so old links and bookmarks land on the new page.
orgRunners.get('/:slug/import', (c) => c.redirect(`/org/${c.req.param('slug')}/runners/import`, 301));

orgRunners.get('/:slug/runners/import/modele.csv', requireOrganizer, async (c) =>
  csvResponse(c, 'modele-coureurs.csv', templateCsv(await runnerDb(c.env.DB).distanceKeys(c.get('race').id))),
);

type Upload = { text: string; fileName?: string } | { problem: ImportProblem };

/** A sent file (any encoding Excel writes) or pasted lines; the text travels in the preview for the confirmation. */
const readUpload = async (form: Record<string, unknown>): Promise<Upload> => {
  const file = form.file instanceof File && form.file.size > 0 ? form.file : null;
  if (file) {
    const decoded = decodeSpreadsheet(new Uint8Array(await file.arrayBuffer()));
    return decoded.ok ? { text: decoded.text, fileName: file.name } : { problem: decoded.reason };
  }
  const text = typeof form.csv === 'string' ? form.csv : '';
  return text.trim() === '' ? { problem: 'nothing' } : { text };
};

orgRunners.post('/:slug/runners/import', requireOrganizer, requireCan('edit_runners'), async (c) => {
  const race = c.get('race');
  const q = runnerDb(c.env.DB);
  const form = await c.req.parseBody();
  const [upload, distances] = await Promise.all([readUpload(form), q.distanceKeys(race.id)]);
  if ('problem' in upload) return importPage(c, distances, { step: 'choose', problem: upload.problem }, 400);
  const result = parseEntrantsCsv(upload.text, { distances });
  const plan = planImport(await q.entrants(race.id), result.entrants);
  const writes = plan.filter((p) => p.change !== 'same');
  if (form.step !== 'confirm' || writes.length === 0) return importPage(c, distances, { step: 'preview', text: upload.text, fileName: upload.fileName, result, plan });
  await q.importEntrants(race.id, writes.map((p) => p.entrant));
  const added = writes.filter((p) => p.change === 'new').length;
  return c.redirect(`/org/${race.slug}/runners?done=imported&added=${added}&updated=${writes.length - added}&refused=${result.rejected.length}`);
});

// Add one runner by hand.
const formPage = (c: OrgContext, mode: 'new' | 'edit', distances: DistanceKey[], state: RunnerFormState, status: 200 | 400 | 409 = 200) =>
  orgPage(c, 'runners', mode === 'new' ? 'Ajouter un coureur' : 'Modifier un coureur', <OrgRunnerFormPage race={c.get('race')} mode={mode} distances={distances} state={state} />, { status });

const blank = (distances: DistanceKey[]) => runnerFieldsFrom({ distanceKey: distances.length === 1 ? distances[0] : '' });

orgRunners.get('/:slug/runners/new', requireOrganizer, requireCan('edit_runners'), async (c) => {
  const distances = await runnerDb(c.env.DB).distanceKeys(c.get('race').id);
  return formPage(c, 'new', distances, { values: blank(distances), errors: {}, notify: true });
});

/** The bib, the race page and how to sign in, by email; at most a few a day per runner. False when the limit is reached. */
const sendInstructions = async (c: OrgContext, entrant: Entrant): Promise<boolean> => {
  const race = c.get('race');
  const log = instructionsLog(c.env.FILES);
  const now = new Date();
  if (sentInLastDay(await log.list(entrant.id), now) >= MAX_INSTRUCTIONS_PER_DAY) return false;
  const mail = instructionsEmail({
    to: entrant.email, firstName: entrant.firstName, bib: entrant.bib, distance: distanceName(entrant.distanceKey), race,
    raceUrl: `${new URL(c.req.url).origin}/${race.slug}`, window: windowText(race), supportEmail: race.supportEmail,
  });
  c.executionCtx.waitUntil(mailerFor(c.env).send(mail));
  await log.add(entrant.id, { at: now.toISOString(), by: c.get('admin').email });
  return true;
};

orgRunners.post('/:slug/runners/new', requireOrganizer, requireCan('edit_runners'), async (c) => {
  const race = c.get('race');
  const q = runnerDb(c.env.DB);
  const form = await c.req.parseBody();
  const values = runnerFieldsFrom(form);
  const notify = form.notify === '1';
  const distances = await q.distanceKeys(race.id);
  const parsed = parseRunnerInput(values, distances);
  if (!parsed.ok) return formPage(c, 'new', distances, { values, errors: parsed.errors, notify }, 400);
  const entrant = EntrantSchema.parse({ ...parsed.input, id: `${race.id}-${parsed.input.bib}`, raceId: race.id, source: 'manual' });
  if (!(await q.create(entrant))) return formPage(c, 'new', distances, { values, errors: {}, notify, taken: true }, 409);
  const notified = notify && (await sendInstructions(c, entrant));
  return c.redirect(`${runnerHref(race.slug, entrant.bib)}?done=${notified ? 'added_notified' : 'added'}`);
});

// One runner.
const notFoundPage = (c: OrgContext) =>
  orgPage(
    c,
    'runners',
    'Coureur introuvable',
    <>
      <PageHead title="Coureur introuvable" back={{ href: `/org/${c.get('race').slug}/runners`, label: 'Coureurs' }} />
      <Card>
        <Empty title="Aucun coureur n’a ce dossard dans cette course.">Il a peut-être été supprimé, ou le dossard a changé à l’import.</Empty>
      </Card>
    </>,
    { status: 404 },
  );

orgRunners.get('/:slug/runners/:bib', requireOrganizer, async (c) => {
  const race = c.get('race');
  const runner = await runnerDb(c.env.DB).byBib(race.id, c.req.param('bib'));
  if (!runner) return notFoundPage(c);
  const sent = await instructionsLog(c.env.FILES).list(runner.entrant.id);
  const title = `${runner.entrant.firstName} ${runner.entrant.lastName.toUpperCase()}`;
  return orgPage(c, 'runners', title, <OrgRunnerPage race={race} access={c.get('access')} runner={runner} sent={sent} flash={flashFor(c)} />);
});

orgRunners.get('/:slug/runners/:bib/edit', requireOrganizer, requireCan('edit_runners'), async (c) => {
  const race = c.get('race');
  const q = runnerDb(c.env.DB);
  const [runner, distances] = await Promise.all([q.byBib(race.id, c.req.param('bib')), q.distanceKeys(race.id)]);
  if (!runner) return notFoundPage(c);
  return formPage(c, 'edit', distances, { values: runnerFieldsOf(runner.entrant), errors: {} });
});

orgRunners.post('/:slug/runners/:bib/edit', requireOrganizer, requireCan('edit_runners'), async (c) => {
  const race = c.get('race');
  const q = runnerDb(c.env.DB);
  const [runner, distances, form] = await Promise.all([q.byBib(race.id, c.req.param('bib')), q.distanceKeys(race.id), c.req.parseBody()]);
  if (!runner) return notFoundPage(c);
  // The bib is the runner's identity: the stored one wins over anything posted, and is not
  // checked again, since the import takes bibs ("1234/B") the form would not.
  const values = { ...runnerFieldsFrom(form), bib: runner.entrant.bib };
  const parsed = parseRunnerEdit(runner.entrant.bib, values, distances.includes(runner.entrant.distanceKey) ? distances : [...distances, runner.entrant.distanceKey]);
  if (!parsed.ok) return formPage(c, 'edit', distances, { values, errors: parsed.errors }, 400);
  await q.update(EntrantSchema.parse({ ...runner.entrant, ...parsed.input, address: parsed.input.address }));
  return c.redirect(`${runnerHref(race.slug, runner.entrant.bib)}?done=saved`);
});

orgRunners.post('/:slug/runners/:bib/instructions', requireOrganizer, requireCan('edit_runners'), async (c) => {
  const race = c.get('race');
  const runner = await runnerDb(c.env.DB).byBib(race.id, c.req.param('bib'));
  if (!runner) return notFoundPage(c);
  const sent = await sendInstructions(c, runner.entrant);
  return c.redirect(`${runnerHref(race.slug, runner.entrant.bib)}?done=${sent ? 'instructions_sent' : 'instructions_limit'}`);
});

orgRunners.post('/:slug/runners/:bib/delete', requireOrganizer, requireCan('edit_runners'), async (c) => {
  const race = c.get('race');
  const q = runnerDb(c.env.DB);
  const runner = await q.byBib(race.id, c.req.param('bib'));
  if (!runner) return notFoundPage(c);
  if (!(await q.remove(runner.entrant.id))) return c.redirect(`${runnerHref(race.slug, runner.entrant.bib)}?done=has_runs`);
  await instructionsLog(c.env.FILES).clear(runner.entrant.id);
  return c.redirect(`/org/${race.slug}/runners?done=deleted`);
});

// Downloads. The runner list follows the list's filters, so "not signed in yet" can be exported as is.
orgRunners.get('/:slug/export/entrants.csv', requireOrganizer, async (c) => {
  const race = c.get('race');
  const rows = await runnerDb(c.env.DB).all(race.id, runnerQuery(c));
  return csvResponse(c, `${race.slug}-coureurs.csv`, entrantsCsv(rows));
});

orgRunners.get('/:slug/export/results.csv', requireOrganizer, async (c) => {
  const race = c.get('race');
  return csvResponse(c, `${race.slug}-resultats.csv`, resultsCsv(await runnerDb(c.env.DB).resultRows(race.id), race));
});

orgRunners.get('/:slug/export/medals.csv', requireOrganizer, async (c) => {
  const race = c.get('race');
  return csvResponse(c, `${race.slug}-medailles.csv`, medalsCsv(await runnerDb(c.env.DB).medalRows(race.id)));
});
