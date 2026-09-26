import { describe, expect, it } from 'vitest';
import { EntrantSchema } from '../schemas/entrant';
import { parseRunnerEdit, parseRunnerInput, runnerFieldsFrom, runnerFieldsOf } from './runnerInput';

const typed = (over: Record<string, string> = {}) =>
  runnerFieldsFrom({ bib: ' 1234 ', firstName: 'Léa', lastName: 'Martin', email: ' Lea@Example.com ', distanceKey: 'half', ...over });

describe('a runner typed by hand', () => {
  it('gives the entrant fields, email lowercased, no address when none was typed', () => {
    expect(parseRunnerInput(typed(), ['marathon', 'half'])).toEqual({
      ok: true,
      input: { bib: '1234', firstName: 'Léa', lastName: 'Martin', email: 'lea@example.com', distanceKey: 'half' },
    });
  });

  it('points at every field that cannot be saved', () => {
    const result = parseRunnerInput(typed({ bib: '12/3', firstName: '', email: 'lea@', distanceKey: '' }), ['marathon']);
    expect(result).toEqual({ ok: false, errors: { bib: 'invalid', firstName: 'required', email: 'invalid', distanceKey: 'required' } });
  });

  it('refuses a distance the race does not offer, and accepts any when it has no course yet', () => {
    expect(parseRunnerInput(typed({ distanceKey: '5k' }), ['marathon', 'half'])).toEqual({ ok: false, errors: { distanceKey: 'not_offered' } });
    expect(parseRunnerInput(typed({ distanceKey: '5k' }), []).ok).toBe(true);
  });

  it('takes a full address and says which part is missing otherwise', () => {
    const full = parseRunnerInput(typed({ line1: '12 rue des Planches', postalCode: '14800', city: 'Deauville', country: 'France' }), []);
    expect(full.ok && full.input.address).toEqual({ line1: '12 rue des Planches', postalCode: '14800', city: 'Deauville', country: 'FR' });
    expect(parseRunnerInput(typed({ line1: '12 rue des Planches', city: 'Deauville' }), [])).toEqual({ ok: false, errors: { postalCode: 'required' } });
    expect(parseRunnerInput(typed({ line1: '1 rue', postalCode: '1', city: 'X', country: 'Narnia' }), [])).toEqual({ ok: false, errors: { country: 'unknown_country' } });
  });

  it('keeps the stored bib on an edit, even one the import took that a bib typed by hand could not be', () => {
    const imported = ['1234/B', 'M-0012 A', 'B'.repeat(21)];
    expect(imported.map((bib) => parseRunnerEdit(bib, typed({ bib: '999', email: 'lea.martin@example.com' }), ['half']))).toEqual(
      imported.map((bib) => ({ ok: true, input: { bib, firstName: 'Léa', lastName: 'Martin', email: 'lea.martin@example.com', distanceKey: 'half' } })),
    );
    // The other fields are checked as for a new runner.
    expect(parseRunnerEdit('1234/B', typed({ email: 'lea@' }), ['half'])).toEqual({ ok: false, errors: { email: 'invalid' } });
    // Adding by hand still asks for letters, digits and dashes.
    expect(imported.map((bib) => parseRunnerInput(typed({ bib }), ['half']))).toEqual(imported.map(() => ({ ok: false, errors: { bib: 'invalid' } })));
  });

  it('fills the form back from a stored runner', () => {
    const entrant = EntrantSchema.parse({
      id: 'r-1', raceId: 'r', bib: '1', email: 'a@example.com', firstName: 'A', lastName: 'B', distanceKey: 'marathon',
      address: { line1: '1 rue', postalCode: '1000', city: 'Bruxelles', country: 'BE' },
    });
    const fields = runnerFieldsOf(entrant);
    expect(fields).toMatchObject({ bib: '1', country: 'Belgique', line2: '' });
    expect(parseRunnerInput(fields, ['marathon'])).toEqual({ ok: true, input: { bib: '1', email: 'a@example.com', firstName: 'A', lastName: 'B', distanceKey: 'marathon', address: entrant.address } });
  });
});
