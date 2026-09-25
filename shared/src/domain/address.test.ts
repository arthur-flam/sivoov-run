import { describe, expect, it } from 'vitest';
import { addressFromParts, addressLines, countryCode, countryName } from './address';

describe('medal addresses', () => {
  it('reads countries the way people write them, France when blank', () => {
    expect(['France', 'FR', 'fra', '', 'Belgique', 'belgium', 'Suisse', 'États-Unis', 'Royaume-Uni', 'se'].map(countryCode)).toEqual(['FR', 'FR', 'FR', 'FR', 'BE', 'BE', 'CH', 'US', 'GB', 'SE']);
    expect(countryCode('Narnia')).toBeNull();
    expect(countryName('BE')).toBe('Belgique');
    expect(countryName('SE')).toBe('SE');
  });

  it('builds an address from its parts, and none when every part is blank', () => {
    expect(addressFromParts({ line1: ' 12 rue des Planches ', postalCode: '14800', city: 'Deauville', country: '' })).toEqual({
      address: { line1: '12 rue des Planches', postalCode: '14800', city: 'Deauville', country: 'FR' },
      missing: [],
    });
    expect(addressFromParts({ line1: '', line2: ' ', postalCode: '', city: '', country: '' })).toEqual({ missing: [] });
    expect(addressFromParts({})).toEqual({ missing: [] });
    expect(addressFromParts({ country: 'France' })).toEqual({ missing: [] });
  });

  it('puts back the leading zero Excel drops from French postal codes', () => {
    expect(addressFromParts({ line1: '1 place', postalCode: '1000', city: 'Bourg-en-Bresse' }).address?.postalCode).toBe('01000');
    expect(addressFromParts({ line1: '1 rue', postalCode: '1000', city: 'Bruxelles', country: 'Belgique' }).address?.postalCode).toBe('1000');
  });

  it('says what is missing or wrong instead of guessing', () => {
    expect(addressFromParts({ line1: '12 rue des Planches', city: 'Deauville' })).toEqual({ missing: ['postalCode'] });
    expect(addressFromParts({ line1: '1 rue', postalCode: '1000', city: 'X', country: 'Narnia' })).toEqual({ missing: [], badCountry: 'Narnia' });
  });

  it('prints an envelope, with the country only when abroad', () => {
    expect(addressLines({ line1: '12 rue des Planches', line2: 'Bât. B', postalCode: '14800', city: 'Deauville', country: 'FR' })).toEqual(['12 rue des Planches', 'Bât. B', '14800 Deauville']);
    expect(addressLines({ line1: '1 rue', postalCode: '1000', city: 'Bruxelles', country: 'BE' })).toEqual(['1 rue', '1000 Bruxelles', 'Belgique']);
  });
});
