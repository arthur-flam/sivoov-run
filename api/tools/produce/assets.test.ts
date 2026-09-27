import { describe, expect, it } from 'vitest';
import { saysItsWords } from './assets';

describe('a take is heard back', () => {
  it('passes when it says its words, numbers and French variants included', () => {
    expect(saysItsWords('Vous êtes finisher du 10 km des Champs-Élysées ! Votre temps est officiel.', 'Vous êtes finisseur du dix kilomètres des Champs-Élysées. Votre temps est officiel.')).toBe(true);
    expect(saysItsWords('Un kilomètre de plus.', 'Un kilomètre de plus')).toBe(true);
  });

  it('fails when it read its scene or notes aloud, or said something else', () => {
    expect(saysItsWords('Cinq kilomètres ! La moitié.', 'Cinq kilomètres, la moitié ! La voix monte, enthousiaste, comme au passage d’un moment historique.')).toBe(false);
    expect(saysItsWords('Et c’est la ligne !', 'Baissez la ligne')).toBe(false);
    expect(saysItsWords('Partez !', '')).toBe(false);
  });
});
