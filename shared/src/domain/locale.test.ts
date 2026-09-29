import { describe, expect, it } from 'vitest';
import { appLocale, codeEmailLocale, reconcileLanguage, runnerLocale, spokenLocale } from './locale';

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

describe('appLocale', () => {
  it('speaks the phone’s language when nobody has chosen', () => {
    expect(appLocale({ choice: null, device: 'en', raceDefault: 'fr' })).toBe('en');
    expect(appLocale({ choice: null, device: 'fr', raceDefault: 'en' })).toBe('fr');
  });
  it('follows the runner’s choice over the phone', () => {
    expect(appLocale({ choice: 'fr', device: 'en', raceDefault: null })).toBe('fr');
  });
  it('falls back to the race’s language on a phone in another language, then to French', () => {
    expect(appLocale({ choice: null, device: null, raceDefault: 'en' })).toBe('en');
    expect(appLocale({ choice: null, device: null, raceDefault: null })).toBe('fr');
  });
});

describe('spokenLocale', () => {
  it('knows French and English phones, and nothing else', () => {
    expect(spokenLocale('en-GB')).toBe('en');
    expect(spokenLocale('fr-CA')).toBe('fr');
    expect(spokenLocale('de-DE')).toBeNull();
    expect(spokenLocale(undefined)).toBeNull();
  });
});

describe('reconcileLanguage', () => {
  it('sends a choice made on the phone before signing in', () => {
    expect(reconcileLanguage({ choice: 'en', unsynced: true }, undefined)).toEqual({ choice: 'en', push: 'en' });
    expect(reconcileLanguage({ choice: 'en', unsynced: true }, 'fr')).toEqual({ choice: 'en', push: 'en' });
  });
  it('sends nothing when the server already has it', () => {
    expect(reconcileLanguage({ choice: 'en', unsynced: true }, 'en')).toEqual({ choice: 'en', push: null });
  });
  it('takes the runner’s choice made elsewhere (the web, another phone)', () => {
    expect(reconcileLanguage({ choice: 'fr', unsynced: false }, 'en', 'fr')).toEqual({ choice: 'en', push: null });
    expect(reconcileLanguage({ choice: null, unsynced: false }, 'en', 'fr')).toEqual({ choice: 'en', push: null });
  });
  it('tells the server about the phone’s choice when the runner has none there yet', () => {
    expect(reconcileLanguage({ choice: 'en', unsynced: false }, undefined)).toEqual({ choice: 'en', push: 'en' });
  });
  it('saves the phone’s language for a runner who never chose, so the emails match the app', () => {
    expect(reconcileLanguage({ choice: null, unsynced: false }, undefined, 'en')).toEqual({ choice: null, push: 'en' });
  });
  it('saves nothing for a phone in another language: the race’s applies', () => {
    expect(reconcileLanguage({ choice: null, unsynced: false }, undefined, null)).toEqual({ choice: null, push: null });
  });
});
