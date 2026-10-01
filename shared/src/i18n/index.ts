import { fr } from './fr';
import { en } from './en';
import type { Locale } from '../schemas/locale';

export type { Locale } from '../schemas/locale';
export type MessageKey = keyof typeof fr;
export type Params = Record<string, string | number>;

const dictionaries: Record<Locale, Record<MessageKey, string>> = { fr, en };

const fill = (template: string, params: Params = {}): string =>
  Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);

/** French first, English second: unknown locales fall back to French. */
export const resolveLocale = (candidate: string | null | undefined): Locale =>
  candidate?.toLowerCase().startsWith('en') ? 'en' : 'fr';

/**
 * French typography, once for every string: a non-breaking space before « : ; ? ! » and inside
 * « », so a mark never wraps alone onto the next line. Applied to the template, never to the
 * values filled in (names, URLs).
 */
export const frenchSpacing = (text: string): string => text.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

export const t = (locale: Locale, key: MessageKey, params?: Params): string =>
  fill(locale === 'fr' ? frenchSpacing(dictionaries.fr[key]) : dictionaries[locale][key], params);

/** Bound translator for a page or a screen. */
export const translator = (locale: Locale) => (key: MessageKey, params?: Params) => t(locale, key, params);

/** Picks a locale from an Accept-Language header. */
export const localeFromHeader = (header: string | null | undefined): Locale => resolveLocale(header?.split(',')[0]);

export const distanceLabel = (locale: Locale, key: 'marathon' | 'half' | '10k' | '5k'): string => t(locale, `distance.${key}`);
