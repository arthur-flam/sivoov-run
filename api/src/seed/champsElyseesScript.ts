import { GEMINI_TTS_MODEL } from '@sivoov/shared';
import type { AudioScriptInput, LineVoice, ScriptLineInput, ScriptTake } from '@sivoov/shared';

/**
 * The 10 km des Champs-Élysées 2027 and its 5 km demo, the studio's first drafts, written to
 * PRODUCTION.md ("The tone, on one page"): one speaker in two registers (the PA, and close in the
 * ear), the runner's name all the way, said by the speaker and by two regulars in the crowd; here
 * and now, never a history lesson; every line says what comes next; the run read, never judged;
 * a plant at the start paid off 300 m from the line; the race never quiet for long (the rhythm
 * director's fillers, `filler`); no gender agreement about the runner.
 *
 * The 5 km is the 10 km's second half, the same lines 5 km earlier, with a shorter ceremony and
 * its own first kilometre. `api/tools/produce` makes their sound (the voice over crowds, the
 * city, music composed for the race) and the ambiances under them; this file holds the words.
 */

/** The speaker, cast on 2026-10-09 (PRODUCTION.md, « Casting »): Gemini's Sadachbia, directed older and sportier. */
const SPEAKER =
  'Le speaker du 10 km des Champs-Élysées : un homme de cinquante-cinq ans qui anime cette course depuis quinze ans et l’aime toujours. Voix grave et chaude, un peu de grain, qui s’emballe quand la course s’emballe. Complice, rapide, accent parisien naturel.';

/** In the runner's ears, the script's own register: what every line says unless it asks for another. */
export const CHAMPS_DIRECTION = `${SPEAKER} Ici dans l’oreille : bas, posé, un ami qui court à côté.`;

const speaker = (style: string, scene: string): LineVoice => ({ id: 'Sadachbia', direction: `${SPEAKER} ${style}`, scene });
/** On the start village's PA: big, public. */
const PA = speaker('Voix projetée, grande, publique, le sourire dans la voix.', 'Sur la sono du village de départ, devant vingt mille coureurs.');
/** A big moment in the runner's ears: the voice rises. */
const HYPE = speaker('Grand moment : la voix monte, enthousiaste, sans jamais crier.', 'Dans les écouteurs d’un coureur, au milieu de la foule.');
/** Up the cobbles: low, a friend running alongside. */
const CLOSE = speaker('Très bas, tout près, presque chuchoté, le souffle court.', 'Tout près, dans les écouteurs d’un coureur qui monte les pavés.');
/** The park: the only calm of the race. */
const CALM = speaker('Doux, complice, presque à voix basse.', 'Dans les écouteurs d’un coureur, dans un parc calme.');
/** The line. */
const FINISH = speaker('Explosion de joie, voix de fête.', 'Sur la sono de la ligne d’arrivée, dans la clameur.');

const ROADSIDE = 'Au bord de la route, dans la foule, au passage d’un coureur.';
/** A regular in the crowd: a Parisienne who comes to every race and shouts for everyone. */
const MARTINE: LineVoice = {
  id: 'Gacrux',
  direction: 'Une Parisienne de soixante ans qui vient encourager à chaque course. Elle crie fort, chaleureuse et gouailleuse, les mains en porte-voix.',
  scene: ROADSIDE,
};
/** Another: a young club runner come to cheer, all energy. */
const CLUB: LineVoice = {
  id: 'Puck',
  direction: 'Un jeune coureur de club venu encourager les autres, survolté, qui crie fort et vite, avec un grand sourire.',
  scene: ROADSIDE,
};

const line = (l: ScriptLineInput): ScriptLineInput => l;
const at = (meters: number) => ({ kind: 'distance' as const, meters });
const name = (template: string) => ({ kind: 'template' as const, template });
/** A take: its words for everyone, maybe the runner's own version, maybe a moment of the run. */
const take = (id: string, text: string, template?: string, when?: ScriptTake['when']): ScriptTake => ({
  id,
  text,
  ...(template ? { personal: name(template) } : {}),
  ...(when ? { when } : {}),
});

/* ---------- before the clock ---------- */

/** The village first, then the PA. Sound before words: the first seconds decide whether the runner trusts the audio. */
const village = line({
  id: 'ceremony.village', title: 'Le village', category: 'ceremony', mix: 'interrupt', priority: 10,
  trigger: { kind: 'cue', at: 'armed', order: 1 }, key: 'ceremony-village', voice: PA,
  text: 'Bonjour Paris !',
});

const countdown = line({
  id: 'ceremony.countdown', title: 'Compte à rebours', category: 'ceremony', mix: 'wait', priority: 10,
  // The on-screen digits follow this file second by second; the crowd counts the last three along.
  trigger: { kind: 'cue', at: 'countdown', order: 1 }, key: 'ceremony-countdown', voice: PA,
  text: 'Dix. Neuf. Huit. Sept. Six. Cinq. Quatre. Trois. Deux. Un.',
});

const gun = line({
  id: 'ceremony.gun', title: 'Le départ', category: 'ceremony', mix: 'wait', priority: 10,
  // The clock starts when this file starts; its ambiance (the drop, the roar) carries on into the run.
  trigger: { kind: 'cue', at: 'gun', order: 1 }, key: 'ceremony-gun', voice: PA,
  text: 'Partez !',
});

/* ---------- all along ---------- */

/** Every kilometre, read against the runner's own opening pace: never judged. */
const split = line({
  id: 'personal.split', title: 'Chaque kilomètre', category: 'personal', mix: 'duck', priority: 4, once: false,
  trigger: { kind: 'split', everyMeters: 1000 }, key: 'split',
  text: 'Un kilomètre de plus.',
  personal: name('Kilomètre {km}. {temps}.'),
  takes: [
    take('round', 'Un kilomètre de plus… et ça se présente bien.', 'Kilomètre {km}. À ce rythme… {objectif}, c’est jouable.', 'round'),
    take('round-wink', 'Un de plus. Je dis ça, je dis rien…', 'Kilomètre {km}, {temps}. {objectif}… je dis ça, je dis rien.', 'round'),
    take('steady', 'Un kilomètre de plus… et le rythme est là.', 'Kilomètre {km}. {temps}… pile sur votre rythme du départ. C’est exactement ça.', 'steady'),
    take('steady-clock', 'Un de plus. Régulier.', 'Kilomètre {km}, {temps}. Réglé comme une horloge.', 'steady'),
    take('faster', 'Un kilomètre de plus. Ça vous va bien.', 'Kilomètre {km} en {temps_km}… plus vite qu’au départ. Ça vous va bien.', 'faster'),
    take('faster-callback', 'Un de plus. Vous avez trouvé quelque chose.', 'Ce kilomètre-là : {temps_km}. Au départ, vous étiez à {allure_depart}. Vous avez trouvé quelque chose.', 'faster'),
    take('slower', 'Un de plus. Le plus beau est devant.', 'Kilomètre {km}. {temps}. Gardez ce que vous avez… le plus beau est devant.', 'slower'),
    take('slower-together', 'Un de plus. On fait le prochain ensemble.', 'Kilomètre {km}… {temps}. Relâchez les épaules : on fait le prochain ensemble.', 'slower'),
    take('plain', 'Un kilomètre de plus. Tout va bien.', '{temps} au kilomètre {km}. Tout va bien.'),
  ],
});

/** Martine, in the crowd, all the way: the runner's name shouted by someone who means it. */
const martine = line({
  id: 'crowd.martine', title: 'Martine, dans la foule', category: 'personal', mix: 'duck', priority: 3, once: false,
  trigger: { kind: 'filler' }, key: 'crowd-martine', voice: MARTINE,
  text: 'Allez ! Allez !',
  personal: name('Allez {prenom} !'),
  takes: [
    take('bravo', 'Bravo, c’est magnifique !', 'Bravo {prenom}, c’est magnifique !'),
    take('avec', 'Allez, on est avec vous !', 'Allez {prenom}, on est avec toi !'),
    take('lache', 'Lâchez rien !', '{prenom} ! Lâche rien !'),
    take('foulee', 'Oh, quelle foulée !', 'Oh là là, {prenom}, quelle foulée !'),
    take('pourtoi', 'C’est pour vous, tout ça !', 'Allez {prenom}, c’est pour toi tout ça !'),
    take('tempo', 'Allez, c’est le bon tempo !', 'Allez {prenom}, t’es dans le bon tempo !'),
    take('tacourse', 'Vas-y, c’est votre course !', 'Vas-y {prenom}, c’est ta course !'),
    take('ycroit', 'Allez, on y croit !', 'Allez {prenom}, on y croit !'),
    take('reparti', 'Et c’est reparti ! Allez !', 'Et c’est reparti, {prenom} ! Allez !', 'restart'),
  ],
});

/** The club, further on: younger, louder. */
const club = line({
  id: 'crowd.club', title: 'Le club, dans la foule', category: 'personal', mix: 'duck', priority: 3, once: false,
  trigger: { kind: 'filler' }, key: 'crowd-club', voice: CLUB,
  text: 'Allez allez allez !',
  personal: name('Allez {prenom} ! Allez allez allez !'),
  takes: [
    take('deroule', 'Ça déroule !', 'Vas-y {prenom}, ça déroule !'),
    take('enorme', 'Énorme !', '{prenom} ! Énorme !'),
    take('onlache', 'On lâche rien !', 'Allez {prenom}, on lâche rien !'),
    take('beau', 'Ouais ! C’est beau, ça !', 'Ouais {prenom} ! C’est beau, ça !'),
    take('vole', 'Ça vole !', 'Allez {prenom}, tu voles !'),
    take('rythme', 'Garde ce rythme !', 'Allez {prenom}, garde ce rythme !'),
    take('machine', 'Une machine !', 'Allez {prenom}, t’es une machine !'),
    take('fiers', 'On est fiers de vous !', 'Allez {prenom}, on est fiers de toi !'),
    take('repart', 'Allez, on repart !', 'Allez {prenom}, on repart !', 'restart'),
  ],
});

/** The speaker, close, between the places: a word, a cue for the body. Short beats. */
const companion = line({
  id: 'speaker.companion', title: 'Le speaker, à côté', category: 'coaching', mix: 'duck', priority: 3, once: false,
  trigger: { kind: 'filler' }, key: 'speaker-companion',
  text: 'Je suis là. On continue.',
  takes: [
    take('epaules', 'Relâchez les épaules… voilà.'),
    take('pas', 'Écoutez vos pas. Ils sont réguliers… c’est bon signe.'),
    take('paris', 'Regardez autour de vous… c’est Paris. Et ce matin, il est à vous.'),
    take('respirez', 'Respirez… longuement.'),
    take('bien', 'Bien. Très bien, même.'),
    take('bras', 'Les bras souples. Le regard loin devant.'),
    take('laissez', 'Pas besoin de forcer. Laissez venir.'),
    take('reprise', 'On repart… doucement d’abord. Le rythme revient tout seul.', undefined, 'restart'),
  ],
});

/* ---------- the Champs, the Arc, the Seine, the line: both courses, `from` metres in ---------- */

/**
 * The 10 km's second half, which is the whole 5 km. `from`: where the 10 km's 5th km is on this
 * course (5 000 on the 10 km, 0 on the 5 km). `uTurn`: the 5 km plants the Obélisque there; the
 * 10 km planted it at the start.
 */
const theChamps = (from: number, uTurn: string, uTurnPersonal: string): ScriptLineInput[] => {
  const m = (tenKm: number) => at(tenKm - 5000 + from);
  return [
    line({
      id: 'course.rond-point', title: 'La montée des Champs', category: 'course', mix: 'duck', priority: 7,
      trigger: m(5950), key: 'course-rond-point', voice: HYPE,
      text: 'À droite… et levez les yeux. Tout en haut, l’Arc de Triomphe. Neuf cents mètres de pavés pour aller le chercher.',
    }),
    line({
      id: 'crowd.climb', title: 'Martine, dans la montée', category: 'personal', mix: 'duck', priority: 5,
      trigger: m(6250), key: 'crowd-climb', voice: MARTINE,
      text: 'Allez ! Ça monte, mais ça passe !',
      personal: name('Allez {prenom} ! Ça monte, mais ça passe !'),
    }),
    line({
      id: 'course.cobbles', title: 'Sur les pavés', category: 'coaching', mix: 'duck', priority: 6,
      trigger: m(6450), key: 'course-cobbles', voice: CLOSE,
      text: 'Petits pas. Les bras. L’Arc ne bouge pas… c’est vous qui avancez.',
      personal: name('Petits pas. Les bras. L’Arc ne bouge pas, {prenom}… c’est vous qui avancez.'),
    }),
    line({
      id: 'course.hush', title: 'Juste avant l’Arc', category: 'course', mix: 'duck', priority: 6,
      trigger: m(6790), key: 'course-hush', voice: CLOSE,
      text: 'Écoutez… Cent mètres.',
    }),
    line({
      id: 'course.arc', title: 'Demi-tour sous l’Arc', category: 'ceremony', mix: 'interrupt', priority: 8,
      trigger: m(6900), key: 'course-arc', voice: HYPE,
      text: uTurn,
      personal: name(uTurnPersonal),
    }),
    line({
      id: 'crowd.descent', title: 'Le club, dans la descente', category: 'personal', mix: 'duck', priority: 5,
      trigger: m(7400), key: 'crowd-descent', voice: CLUB,
      text: 'Allez ! Ça descend tout seul !',
      personal: name('Allez {prenom} ! Ça descend tout seul !'),
    }),
    line({
      id: 'course.montaigne', title: 'Avenue Montaigne', category: 'course', mix: 'duck', priority: 6,
      trigger: m(7950), key: 'course-montaigne',
      text: 'Avenue Montaigne, la plus chic de Paris. Les vitrines vous regardent… tenez-vous droit.',
      personal: name('Avenue Montaigne, la plus chic de Paris. Les vitrines vous regardent, {prenom}… tenez-vous droit.'),
    }),
    line({
      id: 'course.alma', title: 'La Seine', category: 'course', mix: 'duck', priority: 6,
      trigger: m(8600), key: 'course-alma',
      text: 'La Seine. Et de l’autre côté de l’eau… la tour Eiffel. Retenez-la : en décembre, c’est à ses pieds que se court la dernière étape du circuit. Dans quatre cents mètres… le dernier kilomètre.',
    }),
    line({
      id: 'course.golden', title: 'Le Golden km', category: 'ceremony', mix: 'interrupt', priority: 8,
      trigger: m(8990), key: 'course-golden', voice: HYPE,
      text: 'Le Golden kilomètre ! Le dernier, chronométré à part. Un pont, une ligne droite… et la ligne. Tout ce qui vous reste… c’est maintenant.',
    }),
    line({
      id: 'course.bridge', title: 'Pont Alexandre-III', category: 'course', mix: 'duck', priority: 7,
      trigger: m(9450), key: 'course-bridge', voice: HYPE,
      text: 'Le pont Alexandre-III, ses statues dorées, le Grand Palais… et tout ce monde-là, il est là pour vous.',
      personal: name('Le pont Alexandre-III, ses statues dorées, le Grand Palais… et tout ce monde-là, {prenom}, il est là pour vous.'),
    }),
    line({
      id: 'crowd.last', title: 'Martine, sur le quai', category: 'personal', mix: 'duck', priority: 5,
      trigger: m(9590), key: 'crowd-last', voice: MARTINE,
      text: 'Allez ! C’est la fin, c’est la plus belle !',
      personal: name('Allez {prenom} ! C’est la fin, c’est la plus belle !'),
    }),
    line({
      id: 'course.obelisk', title: 'L’Obélisque, droit devant', category: 'course', mix: 'interrupt', priority: 8,
      trigger: m(9700), key: 'course-obelisk', voice: HYPE,
      text: 'L’Obélisque… je vous l’avais dit. Trois cents mètres. Tout ce que vous avez.',
      personal: name('L’Obélisque, {prenom}… je vous l’avais dit. Trois cents mètres. Tout ce que vous avez.'),
    }),
    line({
      id: 'course.final', title: 'Le dernier virage', category: 'course', mix: 'duck', priority: 7,
      trigger: m(9850), key: 'course-final', voice: HYPE,
      text: 'Dernier virage… la ligne est là !',
    }),
    line({
      id: 'ceremony.line', title: 'La ligne', category: 'ceremony', mix: 'interrupt', priority: 10,
      trigger: { kind: 'finish' }, key: 'ceremony-line', voice: FINISH,
      text: 'Voilà la ligne !',
    }),
  ];
};

const fillers = [martine, club, companion];

/* ---------- the 10 km ---------- */

export const champsElysees2027Script: AudioScriptInput = {
  courseId: '10km-champs-elysees-2027-10k',
  version: 1,
  locale: 'fr',
  voice: { id: 'Sadachbia', name: 'Le speaker (Gemini)', model: GEMINI_TTS_MODEL, direction: CHAMPS_DIRECTION },
  maxGapS: 150,
  lines: [
    village,
    line({
      id: 'ceremony.welcome', title: 'Bienvenue sur les Champs', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 2 }, key: 'ceremony-welcome', voice: PA,
      text: 'Bienvenue sur les Champs-Élysées ! Vingt mille coureurs cette semaine sur la plus belle avenue du monde… et vous en êtes. Où que vous soyez, vous courez avec nous.',
      personal: name('{prenom}… bienvenue sur les Champs-Élysées ! Vingt mille coureurs cette semaine sur la plus belle avenue du monde… et vous en êtes. Où que vous soyez, vous courez avec nous.'),
    }),
    line({
      id: 'ceremony.word', title: 'Le temps qu’il fait, la route', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 3 }, key: 'ceremony-word', voice: PA,
      text: 'À Paris, l’avenue est fermée pour vous. Là où vous êtes, elle ne l’est pas : gardez un œil sur la route. Coureurs… à vos marques.',
      personal: {
        kind: 'ai',
        prompt:
          'Une phrase sur le temps qu’il fait ce matin chez le coureur (sa ville) et sur les Champs-Élysées. Puis : chez lui la route reste ouverte, qu’il garde un œil dessus. Finissez exactement par « Coureurs… à vos marques. » Trois phrases courtes au plus, sans son prénom (il vient d’être dit).',
      },
    }),
    countdown,
    gun,
    line({
      id: 'course.go', title: 'Vous y êtes', category: 'course', mix: 'duck', priority: 7,
      trigger: at(80), key: 'course-go',
      text: 'Vous y êtes. Droit devant, l’Obélisque : regardez-le bien. Vous le reverrez quand il restera trois cents mètres.',
      personal: name('{prenom}… vous y êtes. Droit devant, l’Obélisque : regardez-le bien. Vous le reverrez quand il restera trois cents mètres.'),
    }),
    line({
      id: 'course.madeleine', title: 'La Madeleine, Malesherbes', category: 'course', mix: 'duck', priority: 6,
      trigger: at(650), key: 'course-madeleine',
      text: 'La Madeleine… et maintenant le boulevard Malesherbes : un long faux plat, tout droit jusqu’au parc. Trouvez votre rythme. Le public s’occupe de vous… on se retrouve au parc Monceau.',
    }),
    line({
      id: 'course.monceau', title: 'Parc Monceau', category: 'course', mix: 'duck', priority: 6,
      trigger: at(2100), key: 'course-monceau', voice: CALM,
      text: 'Parc Monceau. Écoutez… les oiseaux, le gravier sous les pieds. Le seul calme de la course. Profitez-en : au bout, il y a les Champs.',
      personal: name('Parc Monceau. Écoutez… les oiseaux, le gravier sous les pieds. Le seul calme de la course, {prenom}. Profitez-en : au bout, il y a les Champs.'),
    }),
    line({
      id: 'course.lisbonne', title: 'Rue de Lisbonne', category: 'coaching', mix: 'duck', priority: 5,
      trigger: at(3300), key: 'course-lisbonne',
      text: 'Rue de Lisbonne : le point le plus haut de la boucle. Tout ce qui vient… descend. Laissez rouler les jambes.',
    }),
    line({
      id: 'course.record', title: 'Le record', category: 'course', mix: 'duck', priority: 5,
      trigger: at(3850), key: 'course-record',
      text: 'Le record de ce parcours : vingt-huit minutes trente-quatre. À cette vitesse-là, on ne voit rien. Ni le parc, ni l’Arc, ni la Seine. Vous, vous allez tout voir… et dans deux kilomètres, ça commence.',
    }),
    line({
      id: 'course.half', title: 'La moitié', category: 'personal', mix: 'duck', priority: 7,
      trigger: at(5300), key: 'course-half',
      text: 'Cinq kilomètres derrière vous. Le premier tour est fait… et maintenant, les Champs.',
      personal: name('Cinq kilomètres derrière vous, {prenom}. Votre meilleur : {meilleur_km}. Le premier tour est fait… et maintenant, les Champs.'),
    }),
    line({
      id: 'course.approach', title: 'Vers le Rond-Point', category: 'course', mix: 'duck', priority: 6,
      trigger: at(5600), key: 'course-approach',
      text: 'Ça descend… gardez-en sous le pied. Dans trois cents mètres, à droite… vous allez le voir.',
    }),
    ...theChamps(
      5000,
      'Demi-tour ! Le point le plus haut de la course… À partir d’ici, tout redescend. Les Champs-Élysées sont à vous !',
      'Demi-tour ! Le point le plus haut de la course… À partir d’ici, tout redescend. Les Champs-Élysées sont à vous, {prenom} !',
    ),
    line({
      id: 'ceremony.finish', title: 'L’arrivée', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'finish' }, key: 'ceremony-finish', voice: FINISH,
      text: 'Vous avez bouclé le 10 km des Champs-Élysées ! Votre temps est officiel.',
      personal: name('{prenom} {nom} ! {temps} ! Vous avez bouclé le 10 km des Champs-Élysées !'),
    }),
    line({
      id: 'ceremony.after', title: 'Après la ligne', category: 'personal', mix: 'wait', priority: 9,
      trigger: { kind: 'finish' }, key: 'ceremony-after',
      text: 'Respirez… vous l’avez fait. Cette médaille, c’est la première des trois du Paris Masters Circuit. Rendez-vous au Trocadéro en septembre… et au pied de la tour Eiffel en décembre.',
      personal: name(
        'Respirez, {prenom}… Dix kilomètres dans Paris. Votre plus beau : {meilleur_km}. Et cette médaille… c’est la première des trois. Rendez-vous au Trocadéro en septembre, et au pied de la tour Eiffel en décembre.',
      ),
    }),
    split,
    ...fillers,
  ],
};

/* ---------- the 5 km demo ---------- */

/** The trailer: the same countdown and gun, a faster ceremony, the 10 km's best half. */
export const champsElysees5kScript: AudioScriptInput = {
  courseId: '10km-champs-elysees-2027-5k',
  version: 1,
  locale: 'fr',
  voice: { id: 'Sadachbia', name: 'Le speaker (Gemini)', model: GEMINI_TTS_MODEL, direction: CHAMPS_DIRECTION },
  maxGapS: 120,
  lines: [
    village,
    line({
      id: 'ceremony.welcome', title: 'Bienvenue sur les Champs', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'cue', at: 'armed', order: 2 }, key: 'ceremony-welcome-5k', voice: PA,
      text: 'Bienvenue sur les Champs-Élysées ! Cinq kilomètres : la montée vers l’Arc, la Seine… et la ligne. Chez vous, la route reste ouverte : gardez un œil dessus. Coureurs… à vos marques.',
      personal: name(
        '{prenom}… bienvenue sur les Champs-Élysées ! Cinq kilomètres : la montée vers l’Arc, la Seine… et la ligne. Chez vous, la route reste ouverte : gardez un œil dessus. Coureurs… à vos marques.',
      ),
    }),
    countdown,
    gun,
    line({
      id: 'course.go', title: 'Vous y êtes', category: 'course', mix: 'duck', priority: 7,
      trigger: at(60), key: 'course-go-5k',
      text: 'Vous y êtes. Ce premier kilomètre, c’est l’approche : on se garde pour les Champs.',
      personal: name('{prenom}… vous y êtes. Ce premier kilomètre, c’est l’approche : on se garde pour les Champs.'),
    }),
    line({
      id: 'course.faubourg', title: 'Le faubourg Saint-Honoré', category: 'course', mix: 'duck', priority: 6,
      trigger: at(200), key: 'course-faubourg',
      text: 'Le faubourg Saint-Honoré. La rue se resserre, la pierre de chaque côté… Dans sept cents mètres, à droite… les Champs-Élysées.',
    }),
    line({
      id: 'course.approach', title: 'Vers le Rond-Point', category: 'course', mix: 'duck', priority: 6,
      trigger: at(600), key: 'course-approach',
      text: 'Ça descend… gardez-en sous le pied. Dans trois cents mètres, à droite… vous allez le voir.',
    }),
    ...theChamps(
      0,
      'Demi-tour ! À partir d’ici, tout redescend… Et regardez tout en bas : l’Obélisque. C’est là que vous allez !',
      'Demi-tour ! À partir d’ici, tout redescend… Et regardez tout en bas : l’Obélisque. C’est là que vous allez, {prenom} !',
    ),
    line({
      id: 'ceremony.finish', title: 'L’arrivée', category: 'personal', mix: 'wait', priority: 10,
      trigger: { kind: 'finish' }, key: 'ceremony-finish-5k', voice: FINISH,
      text: 'Les Champs-Élysées, c’est fait ! Votre temps est enregistré.',
      personal: name('{prenom} {nom} ! {temps} ! Les Champs-Élysées, c’est fait !'),
    }),
    line({
      id: 'ceremony.after', title: 'Après la ligne', category: 'personal', mix: 'wait', priority: 9,
      trigger: { kind: 'finish' }, key: 'ceremony-after-5k',
      text: 'Respirez… vous l’avez fait. L’Arc, la Seine, la ligne. Le 7 février, ce sera les dix kilomètres… et toute l’avenue rien que pour vous.',
      personal: name('Respirez, {prenom}… L’Arc, la Seine, la ligne. Votre plus beau : {meilleur_km}. Le 7 février, ce sera les dix kilomètres… et toute l’avenue rien que pour vous.'),
    }),
    split,
    ...fillers,
  ],
};
