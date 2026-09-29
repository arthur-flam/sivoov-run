import type { Entrant } from '../schemas/entrant';
import type { Locale } from '../schemas/locale';
import type { Race } from '../schemas/race';

/** The language a runner reads, in the app and in the emails: their own choice, else their race's, else French. */
export const runnerLocale = (entrant: Pick<Entrant, 'locale'> | null | undefined, race: Pick<Race, 'defaultLocale'> | null | undefined): Locale =>
  entrant?.locale ?? race?.defaultLocale ?? 'fr';

/**
 * The sign-in code's email: in the language of the screen that asked for it, since the runner
 * reads it there and types it back; an older app that does not say falls back to `runnerLocale`.
 */
export const codeEmailLocale = (screen: Locale | undefined, entrant: Pick<Entrant, 'locale'>, race: Pick<Race, 'defaultLocale'>): Locale =>
  screen ?? runnerLocale(entrant, race);

/** A phone's language when Sivoov Run speaks it ("en-GB" -> en, "fr-CA" -> fr), else none: a German phone gets the race's. */
export const spokenLocale = (candidate: string | null | undefined): Locale | null => {
  const tag = candidate?.toLowerCase() ?? '';
  return tag.startsWith('en') ? 'en' : tag.startsWith('fr') ? 'fr' : null;
};

/** The app's language: the runner's choice, else the phone's, else the race's, else French. */
export const appLocale = ({ choice, device, raceDefault }: { choice: Locale | null; device: Locale | null; raceDefault: Locale | null }): Locale =>
  choice ?? device ?? raceDefault ?? 'fr';

/** The phone's side of the language: the runner's last choice on it, and whether the server has heard of it. */
export type PhoneLanguage = { choice: Locale | null; unsynced: boolean };

/**
 * After the app hears from the server (`saved` is the runner's language there): a choice made on
 * the phone that the server has not heard of is sent (`push`); a choice made elsewhere (the web,
 * another phone) is taken; a runner with none yet gets the phone's language (`device`) saved, so
 * the emails speak what the app shows.
 */
export const reconcileLanguage = (phone: PhoneLanguage, saved: Locale | undefined, device: Locale | null = null): { choice: Locale | null; push: Locale | null } => {
  if (phone.choice && (phone.unsynced || !saved)) return { choice: phone.choice, push: phone.choice === saved ? null : phone.choice };
  if (saved) return { choice: saved, push: null };
  return { choice: null, push: device };
};
