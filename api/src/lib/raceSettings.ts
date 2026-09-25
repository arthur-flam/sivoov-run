import { RaceSchema, raceDateProblems, toLocalInput, zonedLocalToIso } from '@sivoov/shared';
import type { Race } from '@sivoov/shared';

/**
 * The race settings form: one section per card, each saved on its own. A section takes the
 * submitted fields, merges them into the race, and validates the whole race with `RaceSchema`,
 * so a page can never save a race the rest of the system would refuse.
 */

export const SETTINGS_SECTIONS = ['race', 'window', 'contact', 'colors', 'status'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export type FormValues = Record<string, string>;
export type FieldErrors = Record<string, string>;
export type SettingsFailure = { section: SettingsSection; values: FormValues; errors: FieldErrors };
export type SettingsOutcome = { ok: true; race: Race } | ({ ok: false } & SettingsFailure);

const FIELDS: Record<SettingsSection, readonly string[]> = {
  race: ['name', 'displayName', 'city', 'country', 'dateStart', 'dateEnd', 'organizerUrl'],
  window: ['windowStart', 'windowEnd'],
  contact: ['supportEmail'],
  colors: ['primary', 'onPrimary'],
  status: ['status'],
};

/** What to say under a field the schema refused. */
const MESSAGES: Record<string, string> = {
  name: 'Indiquez le nom officiel de la course.',
  displayName: 'Indiquez le nom à afficher sur les pages.',
  city: 'Indiquez la ville.',
  country: 'Choisissez un pays.',
  dateStart: 'Choisissez le premier jour de la course.',
  dateEnd: 'Choisissez le dernier jour de la course.',
  organizerUrl: 'Cette adresse de site ne semble pas valide. Exemple : www.votre-course.fr',
  windowStart: 'Indiquez une date et une heure.',
  windowEnd: 'Indiquez une date et une heure.',
  supportEmail: 'Cette adresse email ne semble pas valide. Exemple : contact@votre-course.fr',
  primary: 'Choisissez une couleur.',
  onPrimary: 'Choisissez une couleur.',
  status: 'Choisissez un état.',
};

/** What to say when the dates are each fine but out of order. */
const ORDER_MESSAGES: Record<string, string> = {
  dateEnd: 'Le dernier jour ne peut pas être avant le premier.',
  windowEnd: 'La fermeture doit venir après l’ouverture.',
};

const text = (form: Record<string, unknown>, key: string): string => {
  const v = form[key];
  return typeof v === 'string' ? v.trim() : '';
};
const optional = (s: string): string | undefined => (s === '' ? undefined : s);
/** "www.course.fr" is what people type: it means https://www.course.fr. */
const withScheme = (url: string): string => (url === '' || /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`);

type Merge = (race: Race, v: FormValues) => { candidate: Record<string, unknown>; errors: FieldErrors };

const MERGES: Record<SettingsSection, Merge> = {
  race: (race, v) => ({
    candidate: {
      ...race, name: v.name, city: v.city, country: v.country, dateStart: v.dateStart, dateEnd: v.dateEnd,
      organizerUrl: optional(withScheme(v.organizerUrl ?? '')), theme: { ...race.theme, displayName: v.displayName },
    },
    errors: {},
  }),
  window: (race, v) => {
    const start = zonedLocalToIso(v.windowStart ?? '', race.timezone);
    const end = zonedLocalToIso(v.windowEnd ?? '', race.timezone, { endOfMinute: true });
    return {
      candidate: { ...race, windowStart: start ?? race.windowStart, windowEnd: end ?? race.windowEnd },
      errors: { ...(start ? {} : { windowStart: MESSAGES.windowStart! }), ...(end ? {} : { windowEnd: MESSAGES.windowEnd! }) },
    };
  },
  contact: (race, v) => ({ candidate: { ...race, supportEmail: optional(v.supportEmail ?? '') }, errors: {} }),
  colors: (race, v) => ({ candidate: { ...race, theme: { ...race.theme, primary: v.primary?.toLowerCase(), onPrimary: v.onPrimary?.toLowerCase() } }, errors: {} }),
  status: (race, v) => ({ candidate: { ...race, status: v.status }, errors: {} }),
};

/** A zod issue path -> the form field it belongs to (`theme.primary` is the `primary` field). */
const fieldOf = (path: readonly PropertyKey[]): string => String(path[0] === 'theme' ? path[1] : path[0]);

/** One card's submitted form, applied to the race: the race to save, or what to show again with the errors. */
export const applySettings = (race: Race, section: SettingsSection, form: Record<string, unknown>): SettingsOutcome => {
  const values: FormValues = Object.fromEntries(FIELDS[section].map((f) => [f, text(form, f)]));
  const { candidate, errors: early } = MERGES[section](race, values);
  const parsed = RaceSchema.safeParse(candidate);
  const schemaErrors: FieldErrors = parsed.success
    ? {}
    : Object.fromEntries(
        parsed.error.issues.map((i) => fieldOf(i.path)).filter((f) => FIELDS[section].includes(f)).map((f) => [f, MESSAGES[f] ?? 'Valeur invalide.']),
      );
  const orderErrors: FieldErrors = parsed.success
    ? Object.fromEntries(raceDateProblems(parsed.data).filter((f) => FIELDS[section].includes(f)).map((f) => [f, ORDER_MESSAGES[f]!]))
    : {};
  const errors = { ...orderErrors, ...schemaErrors, ...early };
  return parsed.success && Object.keys(errors).length === 0 ? { ok: true, race: parsed.data } : { ok: false, section, values, errors };
};

/** The race as the settings form shows it: every field as the text of its input. */
export const settingsValues = (race: Race): FormValues => ({
  name: race.name,
  displayName: race.theme.displayName,
  city: race.city,
  country: race.country,
  dateStart: race.dateStart,
  dateEnd: race.dateEnd,
  organizerUrl: race.organizerUrl ?? '',
  windowStart: toLocalInput(race.windowStart, race.timezone),
  windowEnd: toLocalInput(race.windowEnd, race.timezone),
  supportEmail: race.supportEmail ?? '',
  primary: race.theme.primary,
  onPrimary: race.theme.onPrimary,
  status: race.status,
});
