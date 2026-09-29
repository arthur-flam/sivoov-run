import { t as translate } from '@sivoov/shared';
import type { Locale, MessageKey, Params } from '@sivoov/shared';
import { useLanguage } from '@/stores/language';

/**
 * The language on screen now (`useLanguage`): the runner's choice, else their race's, else
 * French. Read at call time, so a share message or the run's notification is in the language of
 * the moment.
 */
export const currentLocale = (): Locale => useLanguage.getState().locale;

export const t = (key: MessageKey, params?: Params): string => translate(currentLocale(), key, params);

/**
 * For a screen: it (and everything it draws) renders again when the runner changes language.
 * Each screen calls it once; components below it read `t` and `currentLocale` as they render.
 */
export const useLocale = (): Locale => useLanguage((s) => s.locale);
