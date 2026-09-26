import { countryName, formatOfficialTime, toCsv } from '@sivoov/shared';
import type { Address, DistanceKey, Race } from '@sivoov/shared';
import type { MedalRow, ResultRow, RunnerRow } from '../../db/runnerQueries';
import { distanceName } from './format';
import { runStatusView } from './runStatus';

/**
 * The downloads, written for French Excel: semicolons, a BOM, French column titles, French
 * distance names and local times. The runner list can be sent back to the import as it is.
 */

const ADDRESS_HEADERS = ['Adresse', 'Complément', 'Code postal', 'Ville', 'Pays'];
const addressCells = (a: Address | undefined): string[] => (a ? [a.line1, a.line2 ?? '', a.postalCode, a.city, countryName(a.country)] : ['', '', '', '', '']);
const yesNo = (b: boolean): string => (b ? 'Oui' : 'Non');

/** "2026-11-10 12:30" in the race's timezone: Excel reads it as a date. */
const localDateTime = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const entrantsCsv = (rows: RunnerRow[]): string =>
  toCsv([
    ['Dossard', 'Prénom', 'Nom', 'Email', 'Distance', ...ADDRESS_HEADERS, 'Connecté', 'Dans l’application', 'Meilleur temps'],
    ...rows.map(({ entrant, bestMs, presence }) => [
      entrant.bib, entrant.firstName, entrant.lastName, entrant.email, distanceName(entrant.distanceKey), ...addressCells(entrant.address),
      yesNo(presence.sessions > 0), yesNo(presence.appSessions > 0), bestMs === null ? '' : formatOfficialTime(bestMs),
    ]),
  ]);

/** The file's status as `resultRows` folds it: set aside, a test and a finish that does not rank are words of their own. */
const statusLabel = (status: string | null): string => {
  if (status === null) return 'Pas encore couru';
  const ranked = status !== 'not_ranked';
  return runStatusView({ status: ranked ? status : 'finished', source: status === 'simulation' ? 'simulation' : 'app', excluded: status === 'excluded', ranked }).label;
};

/** Only a finish has an arrival time; a run that stopped early keeps it to itself. */
const FINISHED = ['finished', 'uploaded'];

export const resultsCsv = (rows: ResultRow[], race: Race): string =>
  toCsv([
    ['Dossard', 'Prénom', 'Nom', 'Distance', 'Temps', 'Temps en secondes', 'Distance parcourue (m)', 'Statut', 'Arrivée'],
    ...rows.map((r) => [
      r.bib, r.firstName, r.lastName, distanceName(r.distanceKey),
      r.elapsedMs === null ? '' : formatOfficialTime(r.elapsedMs), r.elapsedMs === null ? '' : Math.round(r.elapsedMs / 1000), r.distanceM === null ? '' : Math.round(r.distanceM),
      statusLabel(r.status), r.finishedAt && FINISHED.includes(r.status ?? '') ? localDateTime(r.finishedAt, race.timezone) : '',
    ]),
  ]);

/** Everyone with an official finish, and where to post the medal. A blank address is someone to ask. */
export const medalsCsv = (rows: MedalRow[]): string =>
  toCsv([
    ['Dossard', 'Prénom', 'Nom', 'Email', 'Distance', 'Temps', ...ADDRESS_HEADERS],
    ...rows.map(({ entrant, bestMs }) => [entrant.bib, entrant.firstName, entrant.lastName, entrant.email, distanceName(entrant.distanceKey), formatOfficialTime(bestMs), ...addressCells(entrant.address)]),
  ]);

/** The file to start from: the titles the import expects, and two example lines to overwrite. */
export const templateCsv = (distances: DistanceKey[]): string => {
  const [first = 'marathon', second = first] = distances;
  return toCsv([
    ['Dossard', 'Prénom', 'Nom', 'Email', 'Distance', ...ADDRESS_HEADERS],
    ['1001', 'Marie', 'Durand', 'marie.durand@exemple.fr', distanceName(first), '12 rue des Planches', '', '14800', 'Deauville', 'France'],
    ['1002', 'Paul', 'Martin', 'paul.martin@exemple.fr', distanceName(second), '', '', '', '', ''],
  ]);
};
