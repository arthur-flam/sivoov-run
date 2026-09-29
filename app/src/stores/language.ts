import { create } from 'zustand';
import { z } from 'zod';
import { LocaleSchema, appLocale, reconcileLanguage, spokenLocale } from '@sivoov/shared';
import type { Locale, PhoneLanguage } from '@sivoov/shared';
import { api } from '@/api';
import { storage } from '@/storage';

const KEY = 'sivoov.language';
const StoredSchema = z.object({ choice: LocaleSchema.nullable().catch(null), unsynced: z.boolean().catch(false) });
const NONE: PhoneLanguage = { choice: null, unsynced: false };

const parse = (raw: string | null): PhoneLanguage => {
  try {
    const parsed = StoredSchema.safeParse(raw ? JSON.parse(raw) : null);
    return parsed.success ? parsed.data : NONE;
  } catch {
    return NONE;
  }
};

/** The phone's own language, without a native module: navigator on web, Intl on Hermes. */
export const phoneLocale = (): Locale | null => {
  const g = globalThis as { navigator?: { language?: string } };
  return spokenLocale(g.navigator?.language ?? Intl.DateTimeFormat().resolvedOptions().locale);
};

type LanguageState = PhoneLanguage & {
  /** The phone's language when it is French or English. */
  device: Locale | null;
  /** The runner's race's language, once signed in: for a phone in another language. */
  raceDefault: Locale | null;
  /** The language on screen (`appLocale`): the choice, else the phone's, else the race's, else French. */
  locale: Locale;
  load: () => Promise<void>;
  /** The runner picks a language: on screen at once, on the server as soon as it answers. */
  choose: (locale: Locale, token: string | null) => Promise<void>;
  /** After each `/me` (or its offline copy, with no token): the race's language, and the choice sent or taken (`reconcileLanguage`). */
  sync: (me: { entrant: { locale?: Locale }; race: { defaultLocale: Locale } }, token: string | null) => Promise<void>;
  /** Signed out: the race is forgotten, the phone keeps its choice for the sign-in screen. */
  signedOut: () => void;
};

/** Sends the choice; false when the server could not be reached (the next `sync` sends it again). */
const push = async (token: string | null, locale: Locale): Promise<boolean> => {
  if (!token) return false;
  try {
    await api.setLocale(token, locale);
    return true;
  } catch {
    return false;
  }
};

/**
 * The runner's language in the app: the phone's own (French or English) until they choose. The
 * choice is kept on the phone, so the sign-in screen and an offline start speak it, and on the
 * server (`entrants.locale`), so the emails do too.
 */
export const useLanguage = create<LanguageState>((set, get) => {
  const save = () => void storage.set(KEY, JSON.stringify({ choice: get().choice, unsynced: get().unsynced })).catch(() => undefined);
  const apply = (next: Partial<PhoneLanguage & { raceDefault: Locale | null }>) => {
    set({ ...next, locale: appLocale({ ...get(), ...next }) });
    save();
  };
  const device = phoneLocale();
  return {
    ...NONE,
    device,
    raceDefault: null,
    locale: appLocale({ choice: null, device, raceDefault: null }),
    async load() {
      const stored = parse(await storage.get(KEY).catch(() => null));
      set({ ...stored, locale: appLocale({ ...get(), ...stored }) });
    },
    async choose(locale, token) {
      apply({ choice: locale, unsynced: true });
      if (await push(token, locale)) apply({ unsynced: false });
    },
    async sync(me, token) {
      const { choice, push: send } = reconcileLanguage(get(), me.entrant.locale, get().device);
      // Only a choice waits to be sent again; the phone's language is offered at every sync anyway.
      apply({ choice, raceDefault: me.race.defaultLocale, unsynced: send !== null && send === choice });
      if (send && (await push(token, send))) apply({ unsynced: false });
    },
    signedOut() {
      apply({ raceDefault: null, unsynced: false });
    },
  };
});
