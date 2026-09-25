import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, SLUG_MAX, slugProblem, slugify } from './slug';
import { RaceSchema } from '../schemas/race';

describe('the address suggested from a race name', () => {
  it('is lowercase words joined by dashes, without accents', () => {
    expect(slugify('Marathon International de Deauville 2026')).toBe('marathon-international-de-deauville-2026');
    expect(slugify('  Les 10 km de l’Île-de-Ré ! ')).toBe('les-10-km-de-l-ile-de-re');
    expect(slugify('Cœur de Bœuf Trail')).toBe('coeur-de-boeuf-trail');
    expect(slugify('Semi — Saint-Étienne')).toBe('semi-saint-etienne');
  });
  it('stays short and never ends on a dash', () => {
    const long = slugify('Le très très très long nom de la course la plus longue du monde entier et même plus');
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(long.endsWith('-')).toBe(false);
  });
  it('is empty for a name with no letters or digits', () => {
    expect(slugify('!!! ???')).toBe('');
  });
  it('always passes the race schema when it is not empty', () => {
    const slug = slugify('Marathon de Paris (édition 50)');
    expect(RaceSchema.shape.slug.safeParse(slug).success).toBe(true);
  });
});

describe('an address chosen for a new race', () => {
  it('is fine when well formed and free', () => {
    expect(slugProblem('deauville-2027', ['deauville-2026'])).toBeNull();
  });
  it('cannot take an address already used by a race', () => {
    expect(slugProblem('deauville-2026', ['deauville-2026'])).toBe('taken');
  });
  it('cannot take a word the site uses for its own pages', () => {
    expect(RESERVED_SLUGS.map((s) => slugProblem(s, []))).toEqual(RESERVED_SLUGS.map(() => 'reserved'));
    expect(slugProblem('organisateurs', [])).toBe('reserved');
    expect(slugProblem('media', [])).toBe('reserved');
  });
  it('must be lowercase words joined by single dashes', () => {
    expect(slugProblem('', [])).toBe('empty');
    expect(slugProblem('Deauville', [])).toBe('format');
    expect(slugProblem('deauville--2026', [])).toBe('format');
    expect(slugProblem('-deauville', [])).toBe('format');
    expect(slugProblem('deauville 2026', [])).toBe('format');
    expect(slugProblem('a'.repeat(SLUG_MAX + 1), [])).toBe('too_long');
  });
});
