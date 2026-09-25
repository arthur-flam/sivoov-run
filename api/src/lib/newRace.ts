import { z } from 'zod';
import {
  CourseSchema,
  DISTANCE_METERS,
  DistanceKeySchema,
  OrganizerSchema,
  RaceSchema,
  raceDateProblems,
  raceWeekWindow,
  slugProblem,
  slugify,
  zonedLocalToIso,
} from '@sivoov/shared';
import type { Course, DistanceKey, Organizer, Race } from '@sivoov/shared';
import { newId } from './crypto';

/**
 * Staff create a race: its names, place and dates, the virtual window (the race week by
 * default), the distances it opens, its first owner and the address of its page. It starts as
 * a draft: the page exists but is not listed until an owner opens it.
 */

export const NEW_RACE_TIMEZONE = 'Europe/Paris';
/** The race layer until the organizer picks colors: the neutral ones of tokens.ts. */
export const DEFAULT_RACE_COLORS = { primary: '#1a1a1a', onPrimary: '#ffffff' } as const;

export type NewRace = { race: Race; courses: Course[]; owner: Organizer };
export type NewRaceForm = { values: Record<string, string>; distances: string[]; errors: Record<string, string> };
export type NewRaceOutcome = ({ ok: true } & NewRace) | ({ ok: false } & NewRaceForm);

const FIELDS = ['name', 'displayName', 'city', 'country', 'dateStart', 'dateEnd', 'windowStart', 'windowEnd', 'ownerEmail', 'slug'] as const;

const MESSAGES: Record<string, string> = {
  name: 'Indiquez le nom officiel de la course.',
  displayName: 'Indiquez le nom à afficher sur les pages.',
  city: 'Indiquez la ville.',
  country: 'Choisissez un pays.',
  dateStart: 'Choisissez le premier jour de la course.',
  dateEnd: 'Choisissez le dernier jour de la course.',
  windowStart: 'Indiquez une date et une heure, ou laissez vide pour la semaine de la course.',
  windowEnd: 'Indiquez une date et une heure, ou laissez vide pour la semaine de la course.',
  ownerEmail: 'Cette adresse email ne semble pas valide.',
  distances: 'Cochez au moins une distance.',
};

const ORDER_MESSAGES: Record<string, string> = {
  dateEnd: 'Le dernier jour ne peut pas être avant le premier.',
  windowEnd: 'La fermeture doit venir après l’ouverture.',
};

export const SLUG_MESSAGES: Record<string, string> = {
  empty: 'Choisissez l’adresse de la page.',
  format: 'Des lettres minuscules sans accents, des chiffres et des tirets, par exemple marathon-de-deauville-2027.',
  too_long: 'Cette adresse est trop longue : 60 caractères au plus.',
  reserved: 'Ce mot est déjà utilisé par le site. Choisissez une autre adresse.',
  taken: 'Une course utilise déjà cette adresse. Ajoutez par exemple l’année.',
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]).filter((x): x is string => typeof x === 'string');

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** The window typed by staff, or the race week when both are left empty. */
const windowOf = (v: Record<string, string>): { windowStart: string | null; windowEnd: string | null } => {
  if (!v.windowStart && !v.windowEnd) {
    const week = raceWeekWindow(v.dateStart ?? '', NEW_RACE_TIMEZONE);
    return { windowStart: week?.windowStart ?? null, windowEnd: week?.windowEnd ?? null };
  }
  return {
    windowStart: zonedLocalToIso(v.windowStart ?? '', NEW_RACE_TIMEZONE),
    windowEnd: zonedLocalToIso(v.windowEnd ?? '', NEW_RACE_TIMEZONE, { endOfMinute: true }),
  };
};

/** The staff form -> the race, its courses and its owner, or the form again with its errors. */
export const parseNewRace = (form: Record<string, unknown>, taken: readonly string[], staffEmail: string, now = new Date()): NewRaceOutcome => {
  const typed = Object.fromEntries(FIELDS.map((f) => [f, text(form[f])])) as Record<string, string>;
  // An empty address takes the one suggested from the name.
  const values: Record<string, string> = { ...typed, slug: (typed.slug || slugify(typed.displayName || typed.name || '')).toLowerCase() };
  const picked = list(form.distances);
  const distances = DistanceKeySchema.options.filter((d) => picked.includes(d));
  const window = windowOf(values);
  const slugIssue = slugProblem(values.slug ?? '', taken);
  const owner = EmailSchema.safeParse(values.ownerEmail);
  const candidate = RaceSchema.safeParse({
    id: values.slug, slug: values.slug, name: values.name, city: values.city, country: values.country || 'FR',
    dateStart: values.dateStart, dateEnd: values.dateEnd || values.dateStart,
    windowStart: window.windowStart ?? '', windowEnd: window.windowEnd ?? '', timezone: NEW_RACE_TIMEZONE,
    theme: { displayName: values.displayName || values.name, ...DEFAULT_RACE_COLORS },
    status: 'draft',
  });
  const errors: Record<string, string> = {
    ...(candidate.success
      ? Object.fromEntries(raceDateProblems(candidate.data).map((f) => [f, ORDER_MESSAGES[f]!]))
      : Object.fromEntries(
          candidate.error.issues
            .map((i) => String(i.path[0] === 'theme' ? 'displayName' : i.path[0]))
            .filter((f) => f in MESSAGES)
            .map((f) => [f, MESSAGES[f]!]),
        )),
    ...(window.windowStart ? {} : { windowStart: MESSAGES.windowStart! }),
    ...(window.windowEnd ? {} : { windowEnd: MESSAGES.windowEnd! }),
    ...(distances.length === 0 ? { distances: MESSAGES.distances! } : {}),
    ...(owner.success ? {} : { ownerEmail: MESSAGES.ownerEmail! }),
    ...(slugIssue ? { slug: SLUG_MESSAGES[slugIssue]! } : {}),
  };
  if (!candidate.success || !owner.success || Object.keys(errors).length > 0) return { ok: false, values, distances, errors };
  const race = candidate.data;
  return {
    ok: true,
    race,
    courses: distances.map((key) =>
      CourseSchema.parse({ id: `${race.slug}-${key}`, raceId: race.id, distanceKey: key, distanceM: DISTANCE_METERS[key as DistanceKey], landmarks: [] }),
    ),
    owner: OrganizerSchema.parse({ id: newId(), raceId: race.id, email: owner.data, role: 'owner', invitedBy: staffEmail, createdAt: now.toISOString() }),
  };
};
