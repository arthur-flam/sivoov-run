import { deauvilleMarathonLandmarks } from '@sivoov/shared';
import type { AudioScriptInput } from '@sivoov/shared';

/**
 * v0 French script for the Deauville 2026 marathon, the seed of the studio's draft. Written by
 * hand; the organizer rewrites it in the studio. It shows each kind of line once: the start
 * ceremony as cue lines (intro, the runner called by bib and name, the speaker's word written
 * by the AI for each runner, countdown, gun), one line per landmark from the course fixture,
 * a split every five kilometres said live with the runner's time, and the finish call with the
 * name and the official time. Every personal line has its offline version in `text`.
 * Voice: George on Eleven v3, which reads the `[tags]`.
 */
const landmarkLines: Record<string, string> = {
  planches: 'Vous êtes sur les Planches. Deux cents mètres de bois sous vos pieds, la mer à votre gauche, quarante-deux kilomètres devant vous. Profitez de la vue, la course commence maintenant.',
  normandy: 'Sur votre droite, le Normandy, le palace de 1912 qui a vu passer Coco Chanel. Vous, vous passez devant à petites foulées, et c’est très bien ainsi.',
  touques: 'Vous quittez Deauville et traversez Touques. Le front de mer est derrière vous, la campagne normande vous attend. Trouvez votre rythme, il est encore tôt.',
  'saint-arnoult': 'Saint-Arnoult, terre de haras. Ici on élève les meilleurs pur-sang du pays. Vous n’avez pas besoin d’être un pur-sang, il vous suffit d’être régulier.',
  tourgeville: 'Tourgéville. Villas, bocage, et un vent qui vous tourne autour. Le bocage est votre allié aujourd’hui, il coupe le vent quand vous en avez besoin.',
  half: 'Mi-course ! Vingt et un kilomètres derrière vous, et la mer qui vous attend à l’arrivée. À partir de maintenant, chaque pas vous rapproche des Planches.',
  hippodrome: 'L’hippodrome de la Touques. Les chevaux tournent ici depuis 1864. Vous, vous ne tournez pas : vous rentrez. Douze kilomètres, vous les connaissez.',
  sunset: 'Sunset Beach. La Manche est là, sur votre gauche, et elle ne vous quitte plus jusqu’à l’arrivée. Quatre kilomètres. Vous tenez le bon bout.',
};

export const deauville2026MarathonScript: AudioScriptInput = {
  courseId: 'deauville-2026-marathon',
  version: 1,
  locale: 'fr',
  voice: { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', model: 'eleven_v3' },
  lines: [
    {
      id: 'ceremony.intro', title: 'Présentation', category: 'ceremony', mix: 'interrupt', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 1 }, key: 'ceremony-intro',
      text: '[excited] Bienvenue au Marathon International de Deauville ! Vous êtes sur la ligne de départ, face à la mer, avec des milliers de coureurs. Le parcours fait le tour de la côte fleurie, par Touques, Saint-Arnoult et Tourgéville, avant de revenir vers les Planches. Nous serons dans vos oreilles tout le long.',
    },
    {
      id: 'ceremony.call', title: 'L’appel sur la ligne', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 2 }, key: 'ceremony-call',
      text: 'Coureurs du marathon, vous êtes attendus sur la ligne.',
      personal: { kind: 'template', template: 'Dossard {dossard}. {prenom} {nom} : [excited] vous êtes attendu sur la ligne !' },
    },
    {
      id: 'ceremony.word', title: 'Le mot du speaker', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 3 }, key: 'ceremony-word',
      text: 'Où que vous soyez ce matin, vous courez avec Deauville. Vous êtes sur des routes ouvertes : la course ne vous protège pas, regardez pour deux. Coureurs… à vos marques.',
      personal: {
        kind: 'ai',
        prompt: 'Saluez le coureur par son prénom et sa ville. Dites-lui en une phrase le temps qu’il fait chez lui et à Deauville. Rappelez qu’il court sur des routes ouvertes. Finissez exactement par « Coureurs… à vos marques. » Trois phrases courtes au plus.',
      },
    },
    {
      id: 'ceremony.countdown', title: 'Compte à rebours', category: 'ceremony', mix: 'wait', priority: 10,
      // The on-screen digits follow this file second by second: numbers only, one a second.
      trigger: { kind: 'cue', at: 'countdown', order: 1 }, key: 'ceremony-countdown',
      text: 'Dix. Neuf. Huit. Sept. Six. Cinq. Quatre. Trois. Deux. Un.',
    },
    {
      id: 'ceremony.gun', title: 'Le départ', category: 'ceremony', mix: 'wait', priority: 10,
      // The clock starts when this file starts playing.
      trigger: { kind: 'cue', at: 'gun', order: 1 }, key: 'ceremony-gun',
      text: 'Partez ! Bonne course à toutes et à tous !',
    },
    ...deauvilleMarathonLandmarks
      .filter((l) => l.id in landmarkLines)
      .map((l) => ({
        id: `course.${l.id}`, title: l.name, category: 'course' as const, mix: 'duck' as const, priority: 6,
        trigger: { kind: 'distance' as const, meters: l.meters }, key: `landmark-${l.id}`,
        text: landmarkLines[l.id]!,
      })),
    {
      id: 'personal.split', title: 'Passage', category: 'personal', mix: 'duck', priority: 4, once: false,
      trigger: { kind: 'split', everyMeters: 5000 }, key: 'split',
      text: 'Encore une borne de cinq kilomètres derrière vous.',
      personal: { kind: 'template', template: 'Kilomètre {km}. {temps}. Vous tenez {allure}.' },
    },
    {
      id: 'ceremony.finish', title: 'L’arrivée', category: 'ceremony', mix: 'interrupt', priority: 10,
      trigger: { kind: 'finish' }, key: 'ceremony-finish',
      text: '[excited] Vous franchissez la ligne d’arrivée sur les Planches de Deauville ! Quarante-deux kilomètres cent quatre-vingt-quinze mètres, face à la mer. Votre temps est officiel. Bravo, marathonien.',
      personal: { kind: 'template', template: '[excited] {prenom} {nom} ! {temps} ! Vous franchissez la ligne sur les Planches de Deauville. Votre temps est officiel. Bravo !' },
    },
  ],
};
