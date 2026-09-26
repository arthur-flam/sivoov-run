import { describe, expect, it } from 'vitest';
import {
  SAMPLE_LIVE,
  SAMPLE_RUNNER,
  fillTemplate,
  liveFactsFor,
  livePlaceholders,
  placeholderNamed,
  placeholdersIn,
  spokenValues,
  templatePhase,
  unknownPlaceholders,
} from './placeholders';
import { audioTagsIn, stripAudioTags, supportsAudioTags, textForVoice } from './audioTags';

describe('placeholders', () => {
  it('finds the names between braces, once each, and reads the old English names as aliases', () => {
    expect(placeholdersIn('Dossard {dossard}, {prenom} {nom} ! Allez {prenom} !')).toEqual(['dossard', 'prenom', 'nom']);
    expect(placeholderNamed('firstName')?.key).toBe('prenom');
    expect(placeholderNamed('splitTime')?.key).toBe('temps_km');
    expect(unknownPlaceholders('Bravo {prenon} !')).toEqual(['prenon']);
  });

  it('knows which lines can be rendered before the start and which only during the run', () => {
    expect(templatePhase('Bienvenue {prenom}, de {ville}.')).toBe('prepare');
    expect(templatePhase('Kilomètre {km}, {temps_km}.')).toBe('live');
    expect(livePlaceholders('{prenom}, {temps} !')).toEqual(['temps']);
  });

  it('says every value in words for the voice', () => {
    const values = spokenValues(SAMPLE_RUNNER, SAMPLE_LIVE);
    expect(fillTemplate('Dossard {dossard}, {prenom} {nom}, de {ville}.', values)).toBe('Dossard mille deux cent quarante-sept, Camille Martin, de Lyon.');
    expect(fillTemplate('Kilomètre {km}, {temps_km}. Vous tenez {allure}.', values)).toBe('Kilomètre douze, cinq minutes vingt-huit. Vous tenez cinq minutes vingt-sept au kilomètre.');
    expect(fillTemplate('{epreuve}', values)).toBe('marathon');
  });

  it('gives the official time with its seconds at the finish', () => {
    const values = spokenValues(SAMPLE_RUNNER, { elapsedS: 13579, finish: true });
    expect(fillTemplate('{prenom} {nom}, {temps} !', values)).toBe('Camille Martin, trois heures, quarante-six minutes et dix-neuf secondes !');
  });

  it('refuses to fill a template with a hole: no town on file means the offline version plays', () => {
    const values = spokenValues({ ...SAMPLE_RUNNER, city: null });
    expect(fillTemplate('Bienvenue à {prenom}, venu de {ville}.', values)).toBeNull();
    expect(fillTemplate('Kilomètre {km}.', values)).toBeNull();
  });
});

describe('liveFactsFor', () => {
  const state = { phase: 'running' as const, distanceM: 21_300, targetM: 42_195, elapsedMs: 6_720_000, splits: [{ km: 21, elapsedMs: 6_650_000, splitMs: 318_000 }], avgPaceSecPerKm: 315.4 };
  it('gives a live line what the run knows now', () => {
    expect(liveFactsFor(state)).toEqual({ km: 21, elapsedS: 6720, lastKmS: 318, paceSecPerKm: 315, projectedS: 13312 });
    expect(fillTemplate('Kilomètre {km}, {temps}. Arrivée prévue en {arrivee_prevue}.', spokenValues(SAMPLE_RUNNER, liveFactsFor(state)))).toBe(
      'Kilomètre vingt et un, une heure cinquante-deux. Arrivée prévue en trois heures quarante et une.',
    );
  });
  it('says the finish is the finish, and leaves out a glitch rather than say it', () => {
    expect(liveFactsFor({ ...state, phase: 'finished', distanceM: 42_195, elapsedMs: 13_579_000 })).toMatchObject({ finish: true, elapsedS: 13_579 });
    expect(liveFactsFor({ ...state, splits: [{ km: 21, elapsedMs: 1, splitMs: 4_000 }] }).lastKmS).toBeUndefined();
    expect(liveFactsFor({ ...state, distanceM: 400, splits: [], avgPaceSecPerKm: null })).toEqual({ km: 0, elapsedS: 6720 });
  });
});

describe('audio tags', () => {
  it('are kept for v3 and stripped for older models, the browser voice and captions', () => {
    const text = '[excited] Partez ! [laughs] Bonne course.';
    expect(audioTagsIn(text)).toEqual(['excited', 'laughs']);
    expect(stripAudioTags(text)).toBe('Partez ! Bonne course.');
    expect(supportsAudioTags('eleven_v3')).toBe(true);
    expect(supportsAudioTags('eleven_multilingual_v2')).toBe(false);
    expect(textForVoice({ model: 'eleven_v3' }, text)).toBe(text);
    expect(textForVoice({ model: 'eleven_multilingual_v2' }, text)).toBe('Partez ! Bonne course.');
  });

  it('never take a placeholder for a tag', () => {
    expect(stripAudioTags('Bravo {prenom} [happy] !')).toBe('Bravo {prenom} !');
    expect(audioTagsIn('{prenom}')).toEqual([]);
  });
});
