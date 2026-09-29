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

/** The phone's side of the language: the runner's last choice on it, and whether the server has heard of it. */
export type PhoneLanguage = { choice: Locale | null; unsynced: boolean };

/**
 * After the app hears from the server (`saved` is the runner's choice there): a choice made on
 * the phone that the server has not heard of is sent (`push`); otherwise the phone takes the
 * server's, which may have been made on the web or on another phone.
 */
export const reconcileLanguage = (phone: PhoneLanguage, saved: Locale | undefined): { choice: Locale | null; push: boolean } =>
  phone.choice && (phone.unsynced || !saved)
    ? { choice: phone.choice, push: phone.choice !== saved }
    : { choice: saved ?? phone.choice, push: false };
