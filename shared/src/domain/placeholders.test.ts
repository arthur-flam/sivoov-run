import { describe, expect, it } from 'vitest';
import {
  SAMPLE_LIVE,
  SAMPLE_RUNNER,
  fillTemplate,
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
