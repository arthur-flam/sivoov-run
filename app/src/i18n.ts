import { resolveLocale, translator } from '@sivoov/shared';
import type { Locale } from '@sivoov/shared';

/** Device locale without a native module: navigator on web, Intl on Hermes. */
export const deviceLocale = (): Locale => {
  const g = globalThis as { navigator?: { language?: string } };
  const candidate = g.navigator?.language ?? Intl.DateTimeFormat().resolvedOptions().locale;
  return resolveLocale(candidate);
};

export const locale: Locale = deviceLocale();
export const t = translator(locale);
