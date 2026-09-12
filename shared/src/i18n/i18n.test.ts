import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { localeFromHeader, resolveLocale, t, translator } from './index';

describe('i18n', () => {
  it('has every key in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });
  it('fills params', () => {
    expect(t('fr', 'signin.welcome', { firstName: 'Marc' })).toBe('Bienvenue, Marc.');
    expect(translator('en')('landing.tagline', { race: 'Deauville' })).toBe('Run Deauville wherever you are.');
  });
  it('is French first', () => {
    expect(resolveLocale(undefined)).toBe('fr');
    expect(resolveLocale('de')).toBe('fr');
    expect(localeFromHeader('en-US,en;q=0.9')).toBe('en');
    expect(localeFromHeader('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
  });
});
