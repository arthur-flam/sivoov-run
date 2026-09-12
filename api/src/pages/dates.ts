import type { Locale } from '@sivoov/shared';

/** Dates shown to runners are in the race's timezone, never the server's. */
export const fmtDate = (iso: string, locale: Locale, timeZone: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string =>
  new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { ...opts, timeZone }).format(new Date(iso));
