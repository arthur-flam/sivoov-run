import type { DeviceInfo, Race } from '@sivoov/shared';
import type { Presence, RunnerFilter } from '../../db/runnerQueries';
import { ago } from './format';
import type { Tone } from './ui';

/** Where a runner stands with the app, in one badge and a short line, the same on every screen. */
export type PresenceView = { label: string; tone: Tone; detail: string };

const PLATFORM: Record<DeviceInfo['platform'], string> = { android: 'Android', ios: 'iPhone', web: 'Navigateur' };

/** "Android 16 · samsung SM-S911B", "iPhone · iOS 18.2". */
export const deviceText = (d: DeviceInfo): string =>
  d.platform === 'ios'
    ? ['iPhone', d.osVersion ? `iOS ${d.osVersion}` : null].filter(Boolean).join(' · ')
    : [`${PLATFORM[d.platform]}${d.osVersion ? ` ${d.osVersion}` : ''}`, d.model].filter(Boolean).join(' · ');

export const presenceView = (p: Presence, now: Date, timeZone: string): PresenceView => {
  const seen = p.lastSeenAt ? ago(p.lastSeenAt, now, timeZone) : '';
  if (p.appSessions > 0) return { label: 'Application', tone: 'good', detail: [p.device ? PLATFORM[p.device.platform] : null, seen].filter(Boolean).join(' · ') };
  if (p.sessions > 0) return { label: 'Web seulement', tone: 'warn', detail: seen };
  return { label: 'Pas connecté', tone: 'neutral', detail: '' };
};

export const FILTER_LABELS: Record<RunnerFilter, string> = {
  all: 'Tous',
  not_signed_in: 'Pas encore connectés',
  signed_in: 'Connectés',
  app: 'Dans l’application',
  ran: 'Ont couru',
  finished: 'Arrivés',
};

/** One line under the chips, so nobody has to guess what a filter means. */
export const FILTER_HINTS: Record<RunnerFilter, string> = {
  all: '',
  not_signed_in: 'Ils n’ont jamais saisi leur code. Depuis la fiche d’un coureur, vous pouvez lui renvoyer les instructions.',
  signed_in: 'Ils ont saisi leur code, sur le site ou dans l’application.',
  app: 'Ils se sont connectés dans l’application Sivoov : ils ont ce qu’il faut pour courir.',
  ran: 'Ils ont lancé au moins une course. Les essais simulés ne comptent pas.',
  finished: 'Ils ont un temps officiel.',
};

export const FILTER_EMPTY: Record<RunnerFilter, string> = {
  all: 'Aucun coureur ne correspond.',
  not_signed_in: 'Tout le monde s’est connecté.',
  signed_in: 'Personne ne s’est encore connecté.',
  app: 'Personne n’a encore ouvert l’application.',
  ran: 'Personne n’a encore couru.',
  finished: 'Personne n’est encore arrivé.',
};

/** "du 9 au 15 novembre", in the race's timezone. */
export const windowText = (race: Race): string => {
  const day = (iso: string, month: boolean) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', ...(month ? { month: 'long' } : {}), timeZone: race.timezone }).format(new Date(iso));
  const sameMonth = day(race.windowStart, true).split(' ')[1] === day(race.windowEnd, true).split(' ')[1];
  return `du ${day(race.windowStart, !sameMonth)} au ${day(race.windowEnd, true)}`;
};
