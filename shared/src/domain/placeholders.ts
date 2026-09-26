import type { LiveFacts } from '../schemas/audio';
import type { DistanceKey } from '../schemas/race';
import type { RunState } from './tracker';
import { frenchNumber, spokenBib, spokenClock, spokenDuration, spokenPace } from './spokenFr';

/**
 * The words an organizer can put between braces in a personalised announcement, and what each
 * becomes in the runner's ears. Two families, because they are known at different times:
 * - `prepare`: known before the start (name, bib, town). Rendered once per runner while the
 *   phone still has a network, downloaded with the pack, played offline.
 * - `live`: known only when the line plays (time, pace). Rendered at that moment if the phone
 *   has a network, otherwise the line's offline version plays.
 * Older scripts used English names (`{firstName}`, `{splitTime}`): they are read as aliases.
 */
export type PlaceholderPhase = 'prepare' | 'live';

export type Placeholder = {
  key: string;
  aliases: string[];
  phase: PlaceholderPhase;
  label: string;
  /** One sentence for the studio: what the runner hears. */
  hint: string;
};

export const PLACEHOLDERS: Placeholder[] = [
  { key: 'prenom', aliases: ['firstName'], phase: 'prepare', label: 'Prénom', hint: 'Le prénom du coureur, comme il l’a donné à l’inscription.' },
  { key: 'nom', aliases: ['lastName'], phase: 'prepare', label: 'Nom', hint: 'Son nom de famille.' },
  { key: 'dossard', aliases: ['bib'], phase: 'prepare', label: 'Dossard', hint: 'Son numéro de dossard, dit en toutes lettres.' },
  { key: 'ville', aliases: ['city'], phase: 'prepare', label: 'Ville', hint: 'La ville de son adresse. Sans ville connue, la version hors ligne est jouée.' },
  { key: 'epreuve', aliases: ['distance'], phase: 'prepare', label: 'Épreuve', hint: '« marathon », « semi-marathon », « dix kilomètres ».' },
  { key: 'km', aliases: [], phase: 'live', label: 'Kilomètre', hint: 'Le kilomètre qu’il vient de passer : « douze ».' },
  { key: 'temps', aliases: ['time'], phase: 'live', label: 'Temps de course', hint: '« une heure cinquante-deux ». À l’arrivée, le temps officiel avec les secondes.' },
  { key: 'temps_km', aliases: ['splitTime'], phase: 'live', label: 'Temps du dernier km', hint: '« cinq minutes vingt-huit ».' },
  { key: 'allure', aliases: ['pace'], phase: 'live', label: 'Allure moyenne', hint: '« cinq minutes trente au kilomètre ».' },
  { key: 'arrivee_prevue', aliases: ['projectedTime'], phase: 'live', label: 'Arrivée prévue', hint: 'Son temps final à cette allure : « trois heures quarante-huit ».' },
];

const PLACEHOLDER = /\{\s*([A-Za-z_][\w]*)\s*\}/g;

/** The names written between braces in a text, as written, in order, without repeats. */
export const placeholdersIn = (text: string): string[] => [...new Set(Array.from(text.matchAll(PLACEHOLDER), (m) => m[1]!))];

export const placeholderNamed = (name: string): Placeholder | undefined => PLACEHOLDERS.find((p) => p.key === name || p.aliases.includes(name));

/** Names the studio does not know: a typo the voice would otherwise read out. */
export const unknownPlaceholders = (text: string): string[] => placeholdersIn(text).filter((n) => !placeholderNamed(n));

/** Names only known once the run is going. */
export const livePlaceholders = (text: string): string[] => placeholdersIn(text).filter((n) => placeholderNamed(n)?.phase === 'live');

/** When a template can be rendered: before the start if it only needs the runner, at play time otherwise. */
export const templatePhase = (text: string): PlaceholderPhase => (livePlaceholders(text).length > 0 ? 'live' : 'prepare');

/** What we know about the runner before the start. */
export type RunnerFacts = { firstName: string; lastName: string; bib: string; city: string | null; distanceKey: DistanceKey };

const EPREUVE: Record<DistanceKey, string> = { marathon: 'marathon', half: 'semi-marathon', '10k': 'dix kilomètres', '5k': 'cinq kilomètres' };

const clean = (s: string | null | undefined): string | null => (s && s.trim().length > 0 ? s.trim() : null);
const maybe = <T>(value: T | undefined, say: (v: T) => string): string | null => (value === undefined ? null : say(value));

/** Every placeholder's spoken value for this runner (and this moment of the run), null when unknown. */
export const spokenValues = (runner: RunnerFacts, live: LiveFacts = {}): Record<string, string | null> => ({
  prenom: clean(runner.firstName),
  nom: clean(runner.lastName),
  dossard: clean(runner.bib) === null ? null : spokenBib(runner.bib),
  ville: clean(runner.city),
  epreuve: EPREUVE[runner.distanceKey],
  km: maybe(live.km, (km) => frenchNumber(km)),
  temps: maybe(live.elapsedS, (s) => (live.finish ? spokenDuration(s) : spokenClock(s))),
  temps_km: maybe(live.lastKmS, spokenClock),
  allure: maybe(live.paceSecPerKm, spokenPace),
  arrivee_prevue: maybe(live.projectedS, spokenClock),
});

/**
 * The template with every placeholder replaced, or null when one has no value (no town on
 * file, no network value): the line then falls back to its offline version, never to a hole.
 */
export const fillTemplate = (template: string, values: Record<string, string | null>): string | null => {
  const names = placeholdersIn(template);
  const resolved = names.map((name) => ({ name, value: values[placeholderNamed(name)?.key ?? ''] ?? null }));
  if (resolved.some((r) => r.value === null)) return null;
  return template.replace(PLACEHOLDER, (_, name: string) => resolved.find((r) => r.name === name)!.value!);
};

const within = (n: number | null | undefined, min: number, max: number): number | undefined =>
  n === null || n === undefined || !Number.isFinite(n) || n < min || n > max ? undefined : Math.round(n);

/**
 * What the run knows right now, for a live line: kilometres done, time, the last kilometre,
 * the average pace, the finish time at that pace, and whether this is the finish. A value out
 * of any plausible range (a GPS glitch) is left out: the line then plays its offline version.
 */
export const liveFactsFor = (state: Pick<RunState, 'phase' | 'distanceM' | 'targetM' | 'elapsedMs' | 'splits' | 'avgPaceSecPerKm'>): LiveFacts => {
  const elapsedS = state.elapsedMs / 1000;
  const facts: LiveFacts = {
    km: within(Math.floor(state.distanceM / 1000), 0, 250),
    elapsedS: within(elapsedS, 0, 172_800),
    lastKmS: within((state.splits[state.splits.length - 1]?.splitMs ?? NaN) / 1000, 30, 7200),
    paceSecPerKm: within(state.avgPaceSecPerKm, 60, 3600),
    projectedS: state.phase === 'running' && state.distanceM >= 1000 ? within((elapsedS * state.targetM) / state.distanceM, 0, 172_800) : undefined,
    finish: state.phase === 'finished' ? true : undefined,
  };
  return Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== undefined)) as LiveFacts;
};

/** The runner the studio uses for « Écouter un exemple ». */
export const SAMPLE_RUNNER: RunnerFacts = { firstName: 'Camille', lastName: 'Martin', bib: '1247', city: 'Lyon', distanceKey: 'marathon' };
/** And the moment of the run: the 12th km, a little over an hour in. */
export const SAMPLE_LIVE: LiveFacts = { km: 12, elapsedS: 3925, lastKmS: 328, paceSecPerKm: 327, projectedS: 13800 };
