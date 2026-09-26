import { describe, expect, it } from 'vitest';
import { frenchNumber, spokenBib, spokenClock, spokenDuration, spokenPace } from './spokenFr';

describe('frenchNumber', () => {
  it('says the numbers a race needs the way a French speaker does', () => {
    expect(frenchNumber(0)).toBe('zéro');
    expect(frenchNumber(12)).toBe('douze');
    expect(frenchNumber(21)).toBe('vingt et un');
    expect(frenchNumber(42)).toBe('quarante-deux');
    expect(frenchNumber(71)).toBe('soixante et onze');
    expect(frenchNumber(77)).toBe('soixante-dix-sept');
    expect(frenchNumber(80)).toBe('quatre-vingts');
    expect(frenchNumber(81)).toBe('quatre-vingt-un');
    expect(frenchNumber(95)).toBe('quatre-vingt-quinze');
    expect(frenchNumber(100)).toBe('cent');
    expect(frenchNumber(200)).toBe('deux cents');
    expect(frenchNumber(201)).toBe('deux cent un');
    expect(frenchNumber(1247)).toBe('mille deux cent quarante-sept');
    expect(frenchNumber(2000)).toBe('deux mille');
    expect(frenchNumber(80_000)).toBe('quatre-vingt mille');
    expect(frenchNumber(200_000)).toBe('deux cent mille');
    expect(frenchNumber(42195)).toBe('quarante-deux mille cent quatre-vingt-quinze');
  });

  it('agrees with a feminine unit', () => {
    expect(frenchNumber(1, { feminine: true })).toBe('une');
    expect(frenchNumber(21, { feminine: true })).toBe('vingt et une');
    expect(frenchNumber(81, { feminine: true })).toBe('quatre-vingt-une');
    expect(frenchNumber(11, { feminine: true })).toBe('onze');
  });

  it('leaves what it cannot say as digits', () => {
    expect(frenchNumber(-3)).toBe('-3');
    expect(frenchNumber(2.5)).toBe('2.5');
  });
});

describe('spoken times', () => {
  it('calls a time on the course like a speaker, seconds dropped past the hour', () => {
    expect(spokenClock(328)).toBe('cinq minutes vingt-huit');
    expect(spokenClock(300)).toBe('cinq minutes');
    expect(spokenClock(40)).toBe('quarante secondes');
    expect(spokenClock(6720)).toBe('une heure cinquante-deux');
    expect(spokenClock(10800)).toBe('trois heures');
    expect(spokenClock(3661)).toBe('une heure une');
  });

  it('says the official time with every unit', () => {
    expect(spokenDuration(13579)).toBe('trois heures, quarante-six minutes et dix-neuf secondes');
    expect(spokenDuration(3600)).toBe('une heure');
    expect(spokenDuration(2701)).toBe('quarante-cinq minutes et une seconde');
    expect(spokenDuration(0)).toBe('zéro seconde');
  });

  it('says a pace per kilometre and a bib', () => {
    expect(spokenPace(330)).toBe('cinq minutes trente au kilomètre');
    expect(spokenBib('1247')).toBe('mille deux cent quarante-sept');
    expect(spokenBib('A12')).toBe('A12');
  });
});
