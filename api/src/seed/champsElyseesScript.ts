import { GEMINI_TTS_MODEL } from '@sivoov/shared';
import type { AudioScriptInput } from '@sivoov/shared';

/**
 * The 10 km des Champs-Élysées 2027 script, the studio's first draft. One voice all the way:
 * the race speaker (Gemini "Sadachbia", native French), heard on the start village's PA and
 * then in the runner's ears. Written to AUDIO_EXPERIENCE.md's rules: silence is the default,
 * silences are announced, the arc escalates (the climb of the Champs, the U-turn under the Arc,
 * the Golden km), specific facts, lines that work in Lyon or on a treadmill, and every
 * personal line has its offline version in `text`.
 *
 * `api/tools/produce` turns most lines into produced files (the voice over crowds, the city,
 * music composed for the race) and gives some an ambiance that plays under them; this file
 * holds the words, the studio holds the rest.
 */
export const CHAMPS_DIRECTION =
  'Le speaker officiel du 10 km des Champs-Élysées. Voix d’homme mûre, chaleureuse et radiophonique. Enthousiaste sans jamais crier, précis, complice avec les coureurs. Français de France, les nombres dits avec netteté.';

const line = (l: AudioScriptInput['lines'][number]) => l;

export const champsElysees2027Script: AudioScriptInput = {
  courseId: '10km-champs-elysees-2027-10k',
  version: 1,
  locale: 'fr',
  voice: { id: 'Sadachbia', name: 'Le speaker (Gemini)', model: GEMINI_TTS_MODEL, direction: CHAMPS_DIRECTION },
  lines: [
    // Before the clock: the start village, the call, the countdown, the gun.
    line({
      id: 'ceremony.welcome', title: 'Bienvenue sur les Champs', category: 'ceremony', mix: 'interrupt', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 1 }, key: 'ceremony-welcome',
      text: 'Bonjour Paris ! Bienvenue au 10 km des Champs-Élysées ! Vingt mille coureurs cette semaine sur la plus belle avenue du monde… et vous en êtes. Où que vous soyez, vous courez avec nous.',
    }),
    line({
      id: 'ceremony.safety', title: 'Routes ouvertes', category: 'safety', mix: 'wait', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 2 }, key: 'ceremony-safety',
      text: 'Une précision avant de partir : à Paris, l’avenue est fermée pour vous. Là où vous êtes, elle ne l’est pas. Gardez un œil sur la route.',
    }),
    line({
      id: 'ceremony.call', title: 'L’appel dans le sas', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 3 }, key: 'ceremony-call',
      text: 'Les coureurs du sas connecté, on vous attend sur la ligne !',
      personal: { kind: 'template', template: 'Dossard {dossard}… {prenom} {nom} ! Bienvenue sur les Champs-Élysées. On vous attend dans le sas !' },
    }),
    line({
      id: 'ceremony.word', title: 'Le mot du speaker', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 4 }, key: 'ceremony-word',
      text: 'Devant vous, la Concorde et son Obélisque. Dix kilomètres de Paris vous attendent. Coureurs… à vos marques.',
      personal: {
        kind: 'ai',
        prompt: 'Saluez le coureur par son prénom et sa ville. Dites en une phrase le temps qu’il fait chez lui et sur les Champs-Élysées. Finissez exactement par « Coureurs… à vos marques. » Trois phrases courtes au plus.',
      },
    }),
    line({
      id: 'ceremony.countdown', title: 'Compte à rebours', category: 'ceremony', mix: 'wait', priority: 10,
      // The on-screen digits follow this file second by second.
      trigger: { kind: 'cue', at: 'countdown', order: 1 }, key: 'ceremony-countdown',
      text: 'Dix. Neuf. Huit. Sept. Six. Cinq. Quatre. Trois. Deux. Un.',
    }),
    line({
      id: 'ceremony.gun', title: 'Le départ', category: 'ceremony', mix: 'wait', priority: 10,
      // The clock starts when this file starts; its ambiance (the drop, the roar) carries on into the run.
      trigger: { kind: 'cue', at: 'gun', order: 1 }, key: 'ceremony-gun',
      text: 'Partez !',
    }),

    // The course.
    line({
      id: 'course.concorde', title: 'La Concorde', category: 'course', mix: 'duck', priority: 6,
      trigger: { kind: 'distance', meters: 300 }, key: 'course-concorde',
      text: 'La Concorde. L’Obélisque vous regarde passer : trois mille ans qu’il en voit d’autres. Laissez partir les pressés… votre course commence à la Madeleine.',
    }),
    line({
      id: 'course.madeleine', title: 'La Madeleine', category: 'course', mix: 'duck', priority: 6,
      trigger: { kind: 'distance', meters: 700 }, key: 'course-madeleine',
      text: 'La Madeleine et ses cinquante-deux colonnes. Maintenant, le boulevard Malesherbes : un long faux plat jusqu’au parc Monceau. Trouvez votre allure. Je vous laisse tranquille… on se retrouve au parc.',
    }),
    line({
      id: 'personal.split', title: 'Chaque kilomètre', category: 'personal', mix: 'duck', priority: 4, once: false,
      trigger: { kind: 'split', everyMeters: 1000 }, key: 'split',
      text: 'Un kilomètre de plus.',
      personal: { kind: 'template', template: 'Kilomètre {km}. {temps}.' },
    }),
    line({
      id: 'course.monceau', title: 'Parc Monceau', category: 'course', mix: 'duck', priority: 6,
      trigger: { kind: 'distance', meters: 2100 }, key: 'course-monceau',
      text: 'Parc Monceau. Les grilles dorées, les allées, et enfin un peu de calme. C’est ici qu’en 1797, André-Jacques Garnerin a sauté d’un ballon avec le tout premier parachute. Il s’est posé sain et sauf, sur cette pelouse. Respirez… ça ne durera pas.',
    }),
    line({
      id: 'course.lisbonne', title: 'Rue de Lisbonne', category: 'coaching', mix: 'duck', priority: 5,
      trigger: { kind: 'distance', meters: 3300 }, key: 'course-lisbonne',
      text: 'Rue de Lisbonne : le point le plus haut de la première boucle. Ce qui vient descend. Laissez rouler les jambes, sans forcer.',
    }),
    line({
      id: 'course.half', title: 'Mi-course', category: 'ceremony', mix: 'duck', priority: 7,
      trigger: { kind: 'distance', meters: 5000 }, key: 'course-half',
      text: 'Cinq kilomètres ! La moitié. Le faubourg Saint-Honoré, et après… la raison pour laquelle vous êtes venu : les Champs-Élysées.',
    }),
    line({
      id: 'course.rond-point', title: 'La montée des Champs', category: 'course', mix: 'duck', priority: 7,
      trigger: { kind: 'distance', meters: 5950 }, key: 'course-rond-point',
      text: 'Le Rond-Point. Levez les yeux : tout en haut, l’Arc de Triomphe. Neuf cents mètres de pavés pour aller le chercher. Petits pas… et laissez la foule vous porter.',
    }),
    line({
      id: 'course.arc', title: 'Demi-tour sous l’Arc', category: 'ceremony', mix: 'interrupt', priority: 8,
      trigger: { kind: 'distance', meters: 6900 }, key: 'course-arc',
      text: 'Demi-tour sous l’Arc de Triomphe ! Le point le plus haut de la course. À partir d’ici… tout redescend. Les Champs-Élysées sont à vous !',
    }),
    line({
      id: 'course.montaigne', title: 'Avenue Montaigne', category: 'course', mix: 'duck', priority: 6,
      trigger: { kind: 'distance', meters: 7950 }, key: 'course-montaigne',
      text: 'Avenue Montaigne. Au numéro trente, un matin de février 1947, Christian Dior présentait le New Look. Quatre-vingts ans plus tard, la tenue qu’on regarde sur cette avenue… c’est la vôtre.',
    }),
    line({
      id: 'course.alma', title: 'L’Alma et la Seine', category: 'course', mix: 'duck', priority: 6,
      trigger: { kind: 'distance', meters: 8600 }, key: 'course-alma',
      text: 'Place de l’Alma. De l’autre côté de la Seine, la tour Eiffel. Retenez-la : c’est à ses pieds que se court la dernière étape du Paris Masters Circuit, en décembre. Pour l’instant… suivez la Seine.',
    }),
    line({
      id: 'course.golden', title: 'Le Golden km', category: 'ceremony', mix: 'interrupt', priority: 8,
      trigger: { kind: 'distance', meters: 9000 }, key: 'course-golden',
      text: 'Le Golden km ! Le dernier kilomètre est chronométré à part. Tout ce qui vous reste… c’est maintenant.',
    }),
    line({
      id: 'course.final', title: 'Remontée vers la ligne', category: 'course', mix: 'duck', priority: 7,
      trigger: { kind: 'distance', meters: 9800 }, key: 'course-final',
      text: 'Dernier virage, le long de la Seine. Remontez vers les Champs… la ligne est là !',
    }),

    // The finish: the roar at once, then the runner's name and time as soon as it is rendered.
    line({
      id: 'ceremony.line', title: 'La ligne', category: 'ceremony', mix: 'interrupt', priority: 10,
      trigger: { kind: 'finish' }, key: 'ceremony-line',
      text: 'Voilà la ligne d’arrivée !',
    }),
    line({
      id: 'ceremony.finish', title: 'L’arrivée', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'finish' }, key: 'ceremony-finish',
      text: 'Vous avez bouclé le 10 km des Champs-Élysées ! Votre temps est officiel.',
      personal: { kind: 'template', template: '{prenom} {nom} ! {temps} ! Vous avez bouclé le 10 km des Champs-Élysées !' },
    }),
  ],
};
