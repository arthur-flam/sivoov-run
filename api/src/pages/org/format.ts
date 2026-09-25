import { distanceLabel } from '@sivoov/shared';
import type { DistanceKey, OrgRole, Race } from '@sivoov/shared';

/** French formatting for the admin. Dates are shown in the race's timezone, never the server's. */

const fmt = (iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat('fr-FR', { ...opts, timeZone }).format(new Date(iso));

/** "14 nov. 2026" */
export const dateFr = (iso: string, timeZone = 'Europe/Paris'): string => fmt(iso, timeZone, { day: 'numeric', month: 'short', year: 'numeric' });

/** "14 nov. à 09:32" */
export const dateTimeFr = (iso: string, timeZone = 'Europe/Paris'): string =>
  `${fmt(iso, timeZone, { day: 'numeric', month: 'short' })} à ${fmt(iso, timeZone, { hour: '2-digit', minute: '2-digit' })}`;

/** "à l’instant", "il y a 5 min", "il y a 3 h", "hier à 18:02", then a date. */
export const ago = (iso: string, now: Date = new Date(), timeZone = 'Europe/Paris'): string => {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 24 * 60) return `il y a ${Math.round(minutes / 60)} h`;
  if (minutes < 48 * 60) return `hier à ${fmt(iso, timeZone, { hour: '2-digit', minute: '2-digit' })}`;
  return dateTimeFr(iso, timeZone);
};

/** "1 coureur", "3 coureurs", "0 coureur" (French keeps zero singular). */
export const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

const KNOWN: readonly string[] = ['marathon', 'half', '10k', '5k'];
/** "Marathon", "Semi-marathon"... and the raw key for anything unexpected. */
export const distanceName = (key: string): string => (KNOWN.includes(key) ? distanceLabel('fr', key as DistanceKey) : key);

export const ROLE_LABELS: Record<OrgRole, string> = { owner: 'Responsable', editor: 'Équipe', viewer: 'Lecture seule' };
export const ROLE_HINTS: Record<OrgRole, string> = {
  owner: 'Tout, y compris les réglages de la course et l’équipe.',
  editor: 'Coureurs, activités, parcours et annonces.',
  viewer: 'Consulter et télécharger les listes, sans rien modifier.',
};

export type WindowState = { phase: 'before' | 'open' | 'after'; text: string };

/** Where the race stands against its virtual window, in one short line. */
export const windowState = (race: Race, now: Date = new Date()): WindowState => {
  const start = new Date(race.windowStart).getTime();
  const end = new Date(race.windowEnd).getTime();
  const day = (iso: string) => fmt(iso, race.timezone, { day: 'numeric', month: 'long' });
  if (now.getTime() < start) {
    const days = Math.ceil((start - now.getTime()) / 86_400_000);
    return { phase: 'before', text: `Ouverture des courses le ${day(race.windowStart)}, dans ${plural(days, 'jour', 'jours')}` };
  }
  if (now.getTime() <= end) return { phase: 'open', text: `Les coureurs courent en ce moment, jusqu’au ${day(race.windowEnd)}` };
  return { phase: 'after', text: `Terminé depuis le ${day(race.windowEnd)}` };
};

export const STATUS_LABELS: Record<Race['status'], string> = { draft: 'Brouillon', open: 'Ouverte', live: 'En cours', closed: 'Terminée' };
