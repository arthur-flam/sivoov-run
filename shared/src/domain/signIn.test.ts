import { describe, expect, it } from 'vitest';
import { whichEntry } from './signIn';

const race = (slug: string, displayName: string) => ({ slug, theme: { displayName, primary: '#000000', onPrimary: '#ffffff', partnerLogos: [] } });
const deauville = race('deauville-2026', 'Marathon de Deauville');
const champs = race('10km-champs-elysees-2027', '10 km des Champs-Élysées');
const entry = (bib: string, r: typeof deauville) => ({ entrant: { bib }, race: r });

describe('which entry a sign-in means', () => {
  it('needs only the email when it holds one entry', () => {
    const only = entry('1001', deauville);
    expect(whichEntry([only], {})).toEqual({ kind: 'one', entry: only });
  });
  it('knows no entry for an unknown email, or a race or bib it does not hold', () => {
    expect(whichEntry([], {})).toEqual({ kind: 'none' });
    expect(whichEntry([entry('1001', deauville)], { raceSlug: champs.slug })).toEqual({ kind: 'none' });
    expect(whichEntry([entry('1001', deauville)], { bib: '1002' })).toEqual({ kind: 'none' });
  });
  it('asks which race when the email is entered in two, then takes the one chosen', () => {
    const both = [entry('1001', deauville), entry('2001', champs)];
    expect(whichEntry(both, {})).toEqual({
      kind: 'ambiguous',
      races: [
        { slug: 'deauville-2026', name: 'Marathon de Deauville' },
        { slug: '10km-champs-elysees-2027', name: '10 km des Champs-Élysées' },
      ],
      bib: false,
    });
    expect(whichEntry(both, { raceSlug: champs.slug })).toEqual({ kind: 'one', entry: both[1] });
  });
  it('asks for the bib when two entries of one race share the email', () => {
    const family = [entry('1001', deauville), entry('1002', deauville)];
    expect(whichEntry(family, { raceSlug: deauville.slug })).toEqual({ kind: 'ambiguous', races: [], bib: true });
    expect(whichEntry(family, { raceSlug: deauville.slug, bib: '1002' })).toEqual({ kind: 'one', entry: family[1] });
  });
});
