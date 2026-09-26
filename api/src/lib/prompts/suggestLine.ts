import { AUDIO_TAGS } from '@sivoov/shared';

/**
 * "Proposer un texte" in the studio: Claude drafts the sentence everyone hears for one line
 * (or a personal line's offline version), from what the studio knows: the race, the places of
 * the course, when the line plays and the lines around it. The organizer reads it, edits it,
 * and only then records the voice: nothing reaches a runner unreviewed.
 */
export type SuggestBrief = {
  race: { name: string; city: string; date: string; distance: string; distanceKm: string };
  landmarks: { name: string; km: string; note: string }[];
  line: { title: string; when: string; category: string; current: string; personal: boolean };
  before: string[];
  after: string[];
  tags: boolean;
};

export const suggestSystem = (tags: boolean): string =>
  [
    'Vous êtes le speaker d’une course sur route et vous écrivez une annonce qu’une voix de synthèse lira dans les écouteurs des coureurs.',
    'Ils courent une course virtuelle : la vraie distance, où qu’ils soient, avec la course dans les oreilles.',
    '',
    'Règles :',
    '- Vouvoiement, présent. Des phrases courtes, faites pour être dites, quinze à vingt-cinq secondes au plus.',
    '- Précis : un lieu, une date, un détail vrai vaut mieux qu’un compliment. N’inventez aucun fait : seulement ce qui est donné.',
    '- Le coureur peut être ailleurs que sur le parcours : évoquez les lieux, ne donnez pas de direction.',
    '- Comptez ce qui est fait, jamais ce qui reste. Pas de fausse promesse. L’arc monte vers l’arrivée : le trentième kilomètre ne sonne pas comme le huitième.',
    '- Ne répétez pas les annonces voisines.',
    '- Tous les nombres en toutes lettres. Pas d’accolades, pas de guillemets, pas d’émoji.',
    tags
      ? `- Vous pouvez placer une ou deux indications de jeu entre crochets, en anglais, parmi : ${AUDIO_TAGS.map((t) => `[${t.tag}]`).join(', ')}.`
      : '- Aucun crochet.',
    '',
    'Répondez uniquement par le texte de l’annonce.',
  ].join('\n');

export const suggestUser = (brief: SuggestBrief): string =>
  [
    `<course>${brief.race.name}, ${brief.race.city}, ${brief.race.date}. Épreuve : ${brief.race.distance} (${brief.race.distanceKm}).</course>`,
    `<lieux>\n${brief.landmarks.map((l) => `- ${l.name}, km ${l.km}${l.note ? ` : ${l.note}` : ''}`).join('\n') || '(aucun)'}\n</lieux>`,
    `<annonce>\nTitre : ${brief.line.title}\nQuand : ${brief.line.when}\nType : ${brief.line.category}${brief.line.personal ? '\nC’est la version hors ligne d’une annonce personnalisée : elle ne nomme pas le coureur.' : ''}\nTexte actuel : ${brief.line.current.trim() || '(vide)'}\n</annonce>`,
    `<avant>\n${brief.before.join('\n') || '(rien)'}\n</avant>`,
    `<apres>\n${brief.after.join('\n') || '(rien)'}\n</apres>`,
  ].join('\n');
