import { t } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';

/** Dates shown to runners are in the race's timezone, never the server's. */
export const fmtDate = (iso: string, locale: Locale, timeZone: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string =>
  new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { ...opts, timeZone }).format(new Date(iso));

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
const FULL: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/**
 * Both ends of a span, the start without what it shares with the end: "9" and "15 novembre",
 * "30 octobre" and "5 novembre". Filled into "Du {start} au {end}" by the caller.
 */
export const fmtSpan = (startIso: string, endIso: string, locale: Locale, timeZone: string, withYear = false): { start: string; end: string } => {
  const same = (opts: Intl.DateTimeFormatOptions) => fmtDate(startIso, locale, timeZone, opts) === fmtDate(endIso, locale, timeZone, opts);
  const endOpts = withYear ? FULL : DAY_MONTH;
  const startOpts = same({ month: 'numeric', year: 'numeric' }) ? { day: 'numeric' as const } : !withYear || same({ year: 'numeric' }) ? DAY_MONTH : FULL;
  return { start: fmtDate(startIso, locale, timeZone, startOpts), end: fmtDate(endIso, locale, timeZone, endOpts) };
};

/** The days of the physical race, from its ISO dates: "14 et 15 novembre 2026", "14 November 2026". */
export const fmtRaceDays = (dateStart: string, dateEnd: string, locale: Locale): string => {
  if (dateStart === dateEnd) return fmtDate(dateStart, locale, 'UTC', FULL);
  const { start, end } = fmtSpan(dateStart, dateEnd, locale, 'UTC', true);
  const consecutive = Date.parse(dateEnd) - Date.parse(dateStart) === 86_400_000;
  return consecutive ? t(locale, 'dates.pair', { first: start, second: end }) : t(locale, 'dates.range', { start, end });
};
