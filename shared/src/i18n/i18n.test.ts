import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { frenchSpacing, localeFromHeader, resolveLocale, t, translator } from './index';

describe('i18n', () => {
  it('has every key in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });
  it('fills params', () => {
    expect(t('fr', 'signin.welcome', { firstName: 'Marc' })).toBe('Bienvenue, Marc.');
    expect(translator('en')('landing.tagline', { race: 'Deauville' })).toBe('Deauville, wherever you are.');
  });
  it('is French first', () => {
    expect(resolveLocale(undefined)).toBe('fr');
    expect(resolveLocale('de')).toBe('fr');
    expect(localeFromHeader('en-US,en;q=0.9')).toBe('en');
    expect(localeFromHeader('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
  });
});

describe('French typography', () => {
  it('keeps « : ; ? ! » and guillemets on the line of the word before them', () => {
    expect(frenchSpacing('Prêt ? « Je participe » : allez !')).toBe('Prêt ? « Je participe » : allez !');
  });
  it('spaces the template, never the values filled in, and leaves English alone', () => {
    expect(t('fr', 'result.bib.title', { firstName: 'A : B', race: 'R' })).toBe('A : B prend le départ · R');
    expect(t('fr', 'share.bibMessage', { race: 'R', distance: 'D', start: '9', end: '15 novembre', bib: '1', url: 'https://x.test' })).toContain('avec moi : https://x.test');
    expect(t('en', 'share.bibMessage', { race: 'R', distance: 'D', start: '9', end: '15', bib: '1', url: 'u' })).not.toContain(' ');
  });
});
