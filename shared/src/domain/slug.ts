/**
 * The address of a race page: run.sivoov.app/<slug>. Lowercase words joined by dashes (the
 * rule of `RaceSchema.slug`), unique, and never a word the site already uses for its own pages.
 */

/** First-level paths of run.sivoov.app that are not races. */
export const RESERVED_SLUGS: readonly string[] = ['org', 'api', 'new', 'leads', 'signin', 'signout', 'organisateurs', 'organizers', 'media', 'results', 'app'];

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 60;

/** Letters that Unicode does not split into a base letter and an accent. */
const LIGATURES: Record<string, string> = { œ: 'oe', æ: 'ae', ß: 'ss' };

/** "Marathon International de Deauville 2026" -> "marathon-international-de-deauville-2026". */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[œæß]/g, (ch) => LIGATURES[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');

export type SlugProblem = 'empty' | 'format' | 'too_long' | 'reserved' | 'taken';

/** Why this address cannot be used for a new race, or null when it can. */
export const slugProblem = (slug: string, taken: readonly string[]): SlugProblem | null => {
  if (slug === '') return 'empty';
  if (slug.length > SLUG_MAX) return 'too_long';
  if (!SLUG_RE.test(slug)) return 'format';
  if (RESERVED_SLUGS.includes(slug)) return 'reserved';
  if (taken.includes(slug)) return 'taken';
  return null;
};
