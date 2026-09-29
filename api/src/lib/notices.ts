import { finishOutcome, formatClock, formatOfficialKm, formatPlaceKm, windowPhase } from '@sivoov/shared';
import type { Course, DeviceInfo, Entrant, FinishOutcome, Lead, Race, Run, RunStart } from '@sivoov/shared';
import type { SessionClient } from './authService';
import { isTestAccount } from './testCode';

/**
 * The owner's Telegram lines (lib/telegram.ts sends them): what people just did, in one or two
 * lines of French, like the admin. Plain text, no parse mode, so nothing a runner or a lead
 * typed can format or break a line; whatever they typed is flattened and cut. A runner is named
 * by name, bib and race, never by email; test accounts, demo races and simulations say so, so a
 * tester is never taken for a real runner.
 */

/** Anything longer than this from outside (a name, a path, an error) is cut with an ellipsis. */
const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** Not production: the line says where it comes from (« [preview] … »), so a test never reads as a real runner. */
export const withEnvironment = (environment: string | undefined, text: string): string =>
  !environment || environment === 'production' ? text : `[${environment}] ${text}`;

type Runner = Pick<Entrant, 'firstName' | 'lastName' | 'bib' | 'email'>;
type RaceRef = Pick<Race, 'name' | 'demoOf'>;

/** « Léa MARTIN (dossard 2002, 10 km des Champs-Élysées) », with « démo » and « test » when they apply. */
export const runnerLabel = (runner: Runner, race: RaceRef): string => {
  const tags = [`dossard ${clip(runner.bib, 20)}`, clip(race.name, 80), race.demoOf ? 'démo' : null, isTestAccount(runner.email) ? 'test' : null];
  const name = clip(`${runner.firstName} ${runner.lastName.toLocaleUpperCase('fr')}`, 80);
  return `${name} (${tags.filter(Boolean).join(', ')})`;
};

const PLATFORM: Record<DeviceInfo['platform'], string> = { android: 'Android', ios: 'iOS', web: 'web' };

/** « le web », or « l’app Android 16 · samsung SM-S911B · v2.0.0 » from the phone's `X-Sivoov-Client` header (older builds: « l’app »). */
export const whereFrom = (client: SessionClient, device: DeviceInfo | null): string => {
  if (client === 'web') return 'le web';
  if (!device) return 'l’app';
  const system = ['l’app', PLATFORM[device.platform], device.osVersion].filter(Boolean).join(' ');
  return [system, device.model, device.appVersion ? `v${device.appVersion}` : null].filter(Boolean).join(' · ');
};

export const signInNotice = (runner: Runner, race: RaceRef, client: SessionClient, device: DeviceInfo | null): string =>
  `🔑 Connexion de ${runnerLabel(runner, race)} sur ${whereFrom(client, device)}`;

/** What a start is, by the same window the results use: the app cannot fake it, the Worker's clock decides. */
export type StartKind = 'official' | 'rehearsal' | 'closed' | 'simulation';

export const startKind = (source: RunStart['source'], race: Pick<Race, 'windowStart' | 'windowEnd'>, atMs: number): StartKind => {
  if (source === 'simulation') return 'simulation';
  const phase = windowPhase(race, atMs);
  return phase === 'before' ? 'rehearsal' : phase === 'after' ? 'closed' : 'official';
};

const START_LABEL: Record<StartKind, string> = {
  official: 'course officielle',
  rehearsal: 'répétition, avant l’ouverture',
  closed: 'hors délai, fenêtre fermée',
  simulation: 'simulation',
};

type CourseRef = Pick<Course, 'distanceM' | 'distanceKey'>;

export const startNotice = (runner: Runner, race: RaceRef & Pick<Race, 'windowStart' | 'windowEnd'>, course: CourseRef, source: RunStart['source'], atMs: number): string =>
  `▶️ Départ de ${runnerLabel(runner, race)} sur ${formatOfficialKm(course.distanceM, course.distanceKey, 'fr')} : ${START_LABEL[startKind(source, race, atMs)]}`;

/**
 * What a stored run is, judged like the results: `run.status` is the one the Worker kept
 * (`officialStatus`), so a short run is already 'abandoned'. A simulation is only ever that,
 * and a run with no start time never counted.
 */
export type FinishKind = FinishOutcome | 'simulation';

export const finishKind = (run: Pick<Run, 'status' | 'source' | 'startedAt' | 'distanceM'>, race: Pick<Race, 'windowStart' | 'windowEnd'>, courseDistanceM: number): FinishKind => {
  if (run.source === 'simulation') return 'simulation';
  if (run.status === 'abandoned' || !run.startedAt) return 'incomplete';
  return finishOutcome({ distanceM: run.distanceM, courseDistanceM, startedAtMs: Date.parse(run.startedAt), window: race });
};

const FINISH_LABEL: Record<FinishKind, string> = {
  official: 'officiel',
  rehearsal: 'répétition, hors classement',
  closed: 'hors délai, hors classement',
  incomplete: 'abandon',
  simulation: 'simulation',
};

/** « 🏁 Léa MARTIN (…) a couru 10 km en 46:34 : officiel »; a run short of the distance says how far it went. */
export const finishNotice = (runner: Runner, race: RaceRef & Pick<Race, 'windowStart' | 'windowEnd'>, course: CourseRef, run: Pick<Run, 'status' | 'source' | 'startedAt' | 'distanceM' | 'elapsedMs'>): string => {
  const km = run.distanceM >= course.distanceM ? formatOfficialKm(course.distanceM, course.distanceKey, 'fr') : formatPlaceKm(run.distanceM, 'fr');
  const label = FINISH_LABEL[finishKind(run, race, course.distanceM)];
  return `🏁 ${runnerLabel(runner, race)} a couru ${km} en ${formatClock(run.elapsedMs)} : ${label}${run.source === 'upload' ? ' (fichier GPX)' : ''}`;
};

/** A race director wrote from /organisateurs: who, which race, and the start of what they wrote on a second line. */
export const leadNotice = (lead: Pick<Lead, 'name' | 'email' | 'race' | 'message'>): string => {
  const who = `✉️ Demande organisateur : ${clip(lead.name, 80)}, ${lead.email} (${clip(lead.race, 100)})${isTestAccount(lead.email) ? ' (test)' : ''}`;
  return lead.message ? `${who}\n« ${clip(lead.message, 200)} »` : who;
};

/** Organizers are staff and partners: their email is fine here. */
export const orgSignInNotice = (email: string, staff: boolean): string =>
  `👤 Connexion à l’admin : ${email}${staff ? ' (staff)' : ''}${isTestAccount(email) ? ' (test)' : ''}`;

/** An uncaught error: the request and the first words of the error, never its stack. */
export const errorNotice = (method: string, path: string, error: unknown): string => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return `🔥 Erreur 500 sur ${method} ${clip(path, 120)} : ${clip(message, 300)}`;
};
