import type { Child } from 'hono/jsx';
import { Field } from './ui';

/** What a form shows: the text of each input, and the error under each refused one. */
export type FormState = { values: Record<string, string>; errors: Record<string, string> };

type InputProps = FormState & {
  name: string;
  label: Child;
  hint?: Child;
  type?: 'text' | 'email' | 'url' | 'date' | 'datetime-local';
  placeholder?: string;
  autocomplete?: string;
  required?: boolean;
  inputmode?: 'url' | 'email';
  /** The first field in error of a failed form takes the focus, so the page opens on it. */
  focus?: boolean;
};

/** A labelled input that keeps what was typed and shows its error in place. */
export const TextField = ({ name, label, hint, type = 'text', values, errors, placeholder, autocomplete, required, inputmode, focus }: InputProps) => (
  <Field label={label} hint={hint} error={errors[name]} for={`f-${name}`}>
    <input
      id={`f-${name}`}
      name={name}
      type={type}
      value={values[name] ?? ''}
      placeholder={placeholder}
      autocomplete={autocomplete ?? 'off'}
      required={required}
      inputmode={inputmode}
      autofocus={focus}
      aria-invalid={errors[name] ? 'true' : undefined}
    />
  </Field>
);

/** The first of `names` that has an error: the one to focus. */
export const firstError = (errors: Record<string, string>, names: readonly string[]): string | undefined => names.find((n) => errors[n]);

/** Countries a race is most likely in, by their French name; any other code is kept as is. */
const COUNTRY_CODES = 'FR BE CH LU MC DE ES IT NL PT GB IE AT DK SE NO PL CZ GR MA TN SN CI CA US JP AU RE GP MQ GF NC PF'.split(' ');

export const countryOptions = (current: string): Array<{ code: string; name: string }> => {
  const names = new Intl.DisplayNames(['fr'], { type: 'region' });
  const codes = COUNTRY_CODES.includes(current) || current === '' ? COUNTRY_CODES : [...COUNTRY_CODES, current];
  return codes.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
};

export const CountryField = ({ values, errors }: FormState) => (
  <Field label="Pays" error={errors.country} for="f-country">
    <select id="f-country" name="country">
      {countryOptions(values.country ?? 'FR').map((c) => (
        <option value={c.code} selected={c.code === (values.country || 'FR')}>
          {c.name}
        </option>
      ))}
    </select>
  </Field>
);
