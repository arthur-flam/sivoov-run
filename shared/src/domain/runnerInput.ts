import { EntrantSchema } from '../schemas/entrant';
import type { Entrant } from '../schemas/entrant';
import { DistanceKeySchema } from '../schemas/race';
import type { DistanceKey } from '../schemas/race';
import { ADDRESS_PARTS, addressFromParts, countryName } from './address';

/**
 * One runner typed by hand in the admin (add or edit). Every field arrives as text; the result
 * is either the entrant's fields or, per field, why it cannot be saved, so the form can keep
 * what was typed and point at the problem.
 */
export const RUNNER_FIELDS = ['bib', 'firstName', 'lastName', 'email', 'distanceKey', ...ADDRESS_PARTS] as const;
export type RunnerField = (typeof RUNNER_FIELDS)[number];
export type RunnerFields = Record<RunnerField, string>;
export type RunnerFieldError = 'required' | 'invalid' | 'not_offered' | 'unknown_country';
export type RunnerInput = Pick<Entrant, 'bib' | 'email' | 'firstName' | 'lastName' | 'distanceKey' | 'address'>;
export type RunnerInputResult = { ok: true; input: RunnerInput } | { ok: false; errors: Partial<Record<RunnerField, RunnerFieldError>> };

/** A bib typed by hand: letters, digits and dashes, as printed on a race bib. The import keeps the organizer's own. */
const BIB = /^[A-Za-z0-9-]{1,20}$/;
const MAX_NAME = 80;

/** Form body -> the runner fields, trimmed; anything missing is blank. */
export const runnerFieldsFrom = (form: Record<string, unknown>): RunnerFields =>
  Object.fromEntries(RUNNER_FIELDS.map((f) => [f, typeof form[f] === 'string' ? (form[f] as string).trim() : ''])) as RunnerFields;

/** An entrant -> the form, to edit it. */
export const runnerFieldsOf = (e: Entrant): RunnerFields => ({
  bib: e.bib,
  firstName: e.firstName,
  lastName: e.lastName,
  email: e.email,
  distanceKey: e.distanceKey,
  line1: e.address?.line1 ?? '',
  line2: e.address?.line2 ?? '',
  postalCode: e.address?.postalCode ?? '',
  city: e.address?.city ?? '',
  country: e.address ? countryName(e.address.country) : '',
});

const typedBib = (bib: string): RunnerFieldError | null => (bib === '' ? 'required' : BIB.test(bib) ? null : 'invalid');

const parseRunner = (fields: RunnerFields, distances: readonly DistanceKey[], bibError: RunnerFieldError | null): RunnerInputResult => {
  const distance = DistanceKeySchema.safeParse(fields.distanceKey);
  const address = addressFromParts(fields);
  const name = (v: string): RunnerFieldError | null => (v === '' ? 'required' : v.length > MAX_NAME ? 'invalid' : null);
  const checks: Array<[RunnerField, RunnerFieldError | null]> = [
    ['bib', bibError],
    ['firstName', name(fields.firstName)],
    ['lastName', name(fields.lastName)],
    ['email', fields.email === '' ? 'required' : EntrantSchema.shape.email.safeParse(fields.email).success ? null : 'invalid'],
    ['distanceKey', !distance.success ? 'required' : distances.length > 0 && !distances.includes(distance.data) ? 'not_offered' : null],
    ...address.missing.map((part): [RunnerField, RunnerFieldError] => [part, 'required']),
    ['country', address.badCountry !== undefined ? 'unknown_country' : null],
  ];
  const errors = Object.fromEntries(checks.filter((c): c is [RunnerField, RunnerFieldError] => c[1] !== null));
  if (Object.keys(errors).length > 0 || !distance.success) return { ok: false, errors };
  return {
    ok: true,
    input: {
      bib: fields.bib,
      firstName: fields.firstName,
      lastName: fields.lastName,
      email: EntrantSchema.shape.email.parse(fields.email),
      distanceKey: distance.data,
      ...(address.address ? { address: address.address } : {}),
    },
  };
};

/** A runner added by hand. `distances`: the race's distances; empty means the race has no course yet and any distance goes. */
export const parseRunnerInput = (fields: RunnerFields, distances: readonly DistanceKey[]): RunnerInputResult => parseRunner(fields, distances, typedBib(fields.bib));

/**
 * A runner edited: the bib is their identity and cannot be changed, so the stored one is kept as
 * it is, whatever was posted, even one the import took that a bib typed by hand could not be
 * ("M-0012 A", "1234/B"). The other fields are checked as for a new runner.
 */
export const parseRunnerEdit = (storedBib: string, fields: RunnerFields, distances: readonly DistanceKey[]): RunnerInputResult =>
  parseRunner({ ...fields, bib: storedBib }, distances, null);
