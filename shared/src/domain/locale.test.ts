import { describe, expect, it } from 'vitest';
import { codeEmailLocale, reconcileLanguage, runnerLocale } from './locale';

describe('runnerLocale', () => {
  it('is the runner’s own choice first', () => {
    expect(runnerLocale({ locale: 'en' }, { defaultLocale: 'fr' })).toBe('en');
    expect(runnerLocale({ locale: 'fr' }, { defaultLocale: 'en' })).toBe('fr');
  });
  it('is the race’s language for a runner who has not chosen', () => {
    expect(runnerLocale({}, { defaultLocale: 'en' })).toBe('en');
  });
  it('is French when nothing is known (before sign-in)', () => {
    expect(runnerLocale(null, null)).toBe('fr');
  });
});

describe('codeEmailLocale', () => {
  it('writes the code in the language of the screen that asked for it', () => {
    expect(codeEmailLocale('en', { locale: 'fr' }, { defaultLocale: 'fr' })).toBe('en');
  });
  it('falls back to the runner’s language when an older app does not say', () => {
    expect(codeEmailLocale(undefined, { locale: 'en' }, { defaultLocale: 'fr' })).toBe('en');
    expect(codeEmailLocale(undefined, {}, { defaultLocale: 'en' })).toBe('en');
  });
});

describe('reconcileLanguage', () => {
  it('sends a choice made on the phone before signing in', () => {
    expect(reconcileLanguage({ choice: 'en', unsynced: true }, undefined)).toEqual({ choice: 'en', push: true });
    expect(reconcileLanguage({ choice: 'en', unsynced: true }, 'fr')).toEqual({ choice: 'en', push: true });
  });
  it('sends nothing when the server already has it', () => {
    expect(reconcileLanguage({ choice: 'en', unsynced: true }, 'en')).toEqual({ choice: 'en', push: false });
  });
  it('takes the runner’s choice made elsewhere (the web, another phone)', () => {
    expect(reconcileLanguage({ choice: 'fr', unsynced: false }, 'en')).toEqual({ choice: 'en', push: false });
    expect(reconcileLanguage({ choice: null, unsynced: false }, 'en')).toEqual({ choice: 'en', push: false });
  });
  it('tells the server about the phone’s choice when the runner has none there yet', () => {
    expect(reconcileLanguage({ choice: 'en', unsynced: false }, undefined)).toEqual({ choice: 'en', push: true });
  });
  it('leaves an unchosen phone unchosen: the race’s language applies', () => {
    expect(reconcileLanguage({ choice: null, unsynced: false }, undefined)).toEqual({ choice: null, push: false });
  });
});
