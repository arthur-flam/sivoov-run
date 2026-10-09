import { COUNTDOWN_SECONDS } from '@sivoov/shared';
import type { AudioCategory, AudioTrigger, CeremonyIssue, LineIssue, Moment, PlaceholderPhase, TakeWhen } from '@sivoov/shared';
import { plural } from './format';
import type { Tone } from './ui';

/**
 * Every sentence the audio screens say about the announcements, in one place. The studio page,
 * the courses page and the studio's JSON answers all read from here, so the browser only
 * paints text the Worker wrote and the copy cannot drift between them.
 */

export const MOMENT_COPY: Record<Moment, { title: string; hint: string; add: string }> = {
  start: { title: 'Au départ', hint: 'Quand le coureur lance sa course, avant le premier mètre.', add: 'Ajouter au départ' },
  course: { title: 'Sur le parcours', hint: 'Dans l’ordre où le coureur les entend.', add: 'Ajouter sur le parcours' },
  always: { title: 'Pendant toute la course', hint: 'Celles qui reviennent : chaque kilomètre, les conseils d’allure, celles qui remplissent les silences.', add: 'Ajouter une annonce qui revient' },
  finish: { title: 'À l’arrivée', hint: 'Quand le coureur franchit la ligne.', add: 'Ajouter à l’arrivée' },
};

export const WHEN_OPTIONS: { key: AudioTrigger['kind']; label: string }[] = [
  { key: 'cue', label: 'Avant le départ (cérémonie)' },
  { key: 'start', label: 'Au départ' },
  { key: 'distance', label: 'À un kilomètre précis' },
  { key: 'elapsed', label: 'Après un temps de course' },
  { key: 'split', label: 'Tous les N kilomètres' },
  { key: 'pace', label: 'Selon l’allure du coureur' },
  { key: 'filler', label: 'Dans les silences de la course' },
  { key: 'finish', label: 'À l’arrivée' },
];

export const CATEGORY_OPTIONS: { key: AudioCategory; label: string }[] = [
  { key: 'ceremony', label: 'Cérémonie : départ, arrivée' },
  { key: 'course', label: 'Parcours : les lieux, le paysage' },
  { key: 'coaching', label: 'Conseils de course' },
  { key: 'personal', label: 'Personnel : prénom, temps de passage' },
  { key: 'safety', label: 'Sécurité' },
];

export const ADVANCED_HINTS = {
  category: 'Sert à trier les annonces. Un coureur qui voudra moins de voix gardera la cérémonie, le parcours et la sécurité.',
  mix: 'La musique du coureur baisse toujours pendant une annonce. Couper est fait pour le départ et l’arrivée.',
  priority: 'Quand deux annonces tombent au même moment, la plus importante passe d’abord.',
  repeat: 'Sinon, le conseil n’est donné qu’une fois dans la course.',
  key: 'Le nom du son dans l’application. Deux annonces ne peuvent pas porter le même.',
};

/** The three answers to "what does the runner hear?", in the order the editor offers them. */
export const SOUND_OPTIONS = [
  { key: 'voice', label: 'La voix', hint: 'La même phrase pour tous, lue par la voix de la course.' },
  { key: 'personal', label: 'Personnalisée', hint: 'Une phrase différente pour chaque coureur, avec une version hors ligne.' },
  { key: 'file', label: 'Votre fichier', hint: 'Votre enregistrement : le directeur de course, la foule, une cloche.' },
] as const;

export const PERSONAL_OPTIONS = [
  { key: 'template', label: 'Une phrase avec des champs', hint: 'Vous écrivez la phrase, les champs entre accolades sont remplis pour chaque coureur.' },
  { key: 'ai', label: 'Écrite par l’IA', hint: 'Vous donnez la consigne, l’IA écrit une phrase pour chaque coureur avant son départ.' },
] as const;

/** When a personal line is made, and what happens without a network. */
export const PHASE_COPY: Record<PlaceholderPhase | 'ai', string> = {
  prepare: 'Préparée pour chaque coureur avant son départ et téléchargée avec les annonces : elle joue même sans réseau.',
  live: 'Dite au moment où elle joue, si le téléphone a du réseau. Sinon, la version hors ligne est jouée.',
  ai: 'L’IA écrit la phrase de chaque coureur quand il prépare sa course (prénom, ville, météo chez lui et à la course). Sans réseau ou sans réponse, la version hors ligne est jouée.',
};

export const FALLBACK_HINT = 'Jouée pour tous quand la version personnalisée n’est pas disponible : pas de réseau, pas de ville connue.';
export const AI_PROMPT_PLACEHOLDER = 'Accueillez le coureur par son prénom et dites-lui le temps qu’il fait chez lui et à la course. Deux phrases, ton de speaker.';
export const TEMPLATE_PLACEHOLDER = 'Dossard {dossard}, {prenom} {nom} : vous êtes attendu sur la ligne.';

/** What stops a line from going out, as the editor says it under the text. */
export const issueText = (issue: LineIssue, personal: boolean): string => {
  const names = 'names' in issue ? issue.names.map((n) => `{${n}}`).join(', ') : '';
  switch (issue.code) {
    case 'no_text':
      return personal ? 'Écrivez la version hors ligne : elle est jouée quand la version personnalisée ne peut pas l’être.' : 'Écrivez le texte lu.';
    case 'placeholder_in_text':
      return `${names} dans le texte lu : la voix le lirait tel quel. Les champs vont dans la version personnalisée.`;
    case 'unknown_placeholder':
      return `${names} n’existe pas. Choisissez un champ dans la liste.`;
    case 'live_before_start':
      return `${names} n’est connu que pendant la course : pas avant le départ.`;
  }
};

/** A line's takes, as the studio names them: « Variante b ». */
export const takeName = (takeId: string): string => `Variante ${takeId}`;

/** A take in a list of lines (a refused publish): « La foule (variante b) ». */
export const takeTitle = (title: string, takeId: string): string => `${title} (variante ${takeId})`;

/** A take's issue, under its line: « Variante b : Écrivez le texte lu. » */
export const takeIssueText = (issue: LineIssue & { take: string }, personal: boolean): string => `${takeName(issue.take)} : ${issueText(issue, personal)}`;

/** When a take fits the run (`TakeWhen`), read from the run, never asked: the tag under it. */
export const TAKE_WHEN_COPY: Record<TakeWhen, string> = {
  steady: 'allure tenue',
  faster: 'plus rapide qu’au départ',
  slower: 'plus lent qu’au départ',
  round: 'temps rond à portée',
  restart: 'après un arrêt',
};

/** A line's takes, shown under it (they are written outside the studio, by the production tool). */
export const TAKES_COPY = {
  title: 'Variantes',
  hint: 'D’autres façons de dire cette annonce. À chaque fois, le coureur entend celle qu’il n’a pas encore entendue, celle écrite pour ce moment de sa course d’abord.',
  personal: 'Personnalisée',
  ai: 'Personnalisée, écrite par l’IA',
  file: 'Votre fichier',
  listen: 'Écouter',
} as const;

/** A line said by someone else than the course's voice (a regular in the crowd): « Voix : Fenrir ». */
export const lineVoiceText = (voiceId: string): string => `Voix : ${voiceId}`;

/** What the start ceremony's checks say under the countdown line (they warn, publishing goes ahead). */
export const ceremonyIssueText = (issue: CeremonyIssue): string => {
  switch (issue.code) {
    case 'countdown_length':
      return `Ce son dure ${String(issue.seconds).replace('.', ',')} s : les chiffres à l’écran suivent ce son, un par seconde, et ne correspondront pas à la voix. Il doit durer ${COUNTDOWN_SECONDS} s : envoyez un fichier de ${COUNTDOWN_SECONDS} secondes.`;
    case 'countdown_twice':
      return 'Un seul compte à rebours affiche les chiffres, le dernier : celui-ci est joué comme une annonce sur la ligne.';
    case 'countdown_without_gun':
      return 'Pas de coup de pistolet après ce compte à rebours : le chrono démarre à la fin de la dernière annonce du départ.';
  }
};

/** 0 to 10, with words on the three values a race director needs. */
export const PRIORITY_OPTIONS: { value: number; label: string }[] = Array.from({ length: 11 }, (_, i) => 10 - i).map((value) => ({
  value,
  label: value === 10 ? '10, la plus haute' : value === 5 ? '5, normale' : value === 0 ? '0, la plus basse' : String(value),
}));

/** Where a line's sound comes from: the voice, the organizer's file, or the voice said to each runner (with its offline version). */
export type LineSource = 'voice' | 'upload' | 'personal';

/** The badge on a line: what it still needs, most urgent first. */
export const lineStatusView = (source: LineSource, state: { ready: boolean; toWrite: boolean; toFix: boolean }): { label: string; tone: Tone } => {
  if (state.toFix) return { label: 'À corriger', tone: 'bad' };
  if (source === 'upload') return state.ready ? { label: 'Fichier audio', tone: 'info' } : { label: 'Fichier introuvable', tone: 'bad' };
  if (state.toWrite) return { label: source === 'personal' ? 'Version hors ligne à écrire' : 'Texte à écrire', tone: 'warn' };
  if (!state.ready) return { label: 'À enregistrer', tone: 'warn' };
  return source === 'personal' ? { label: 'Personnalisée', tone: 'info' } : { label: 'Voix prête', tone: 'good' };
};

/** "12 sept." in the race's timezone. */
export const dayFr = (iso: string, timeZone = 'Europe/Paris'): string =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone }).format(new Date(iso));

export type PublishState = 'empty' | 'fix' | 'missing' | 'ready' | 'current';

export type AudioSummary = {
  lines: number;
  /** Lines with text whose voice is not rendered yet (and uploads whose file is gone). */
  toRecord: number;
  /** Lines with nothing to read yet, or something to correct: publishing waits for them. */
  toFix: number;
  uploads: number;
  personal: number;
  lastPublished: { version: number; at: string } | null;
  /** The draft differs from what runners have. */
  changed: boolean;
  publish: PublishState;
};

/** "12 annonces · 2 à enregistrer · dernière publication le 12 sept." */
export const summaryText = (s: AudioSummary, timeZone?: string): string =>
  s.lines === 0
    ? 'Pas encore d’annonce'
    : [
        plural(s.lines, 'annonce', 'annonces'),
        s.personal > 0 ? `${s.personal} personnalisée${s.personal > 1 ? 's' : ''}` : null,
        s.toFix > 0 ? `${s.toFix} à compléter` : null,
        s.toRecord > 0 ? `${s.toRecord} à enregistrer` : null,
        s.lastPublished ? `dernière publication le ${dayFr(s.lastPublished.at, timeZone)}` : 'pas encore publiées',
      ]
        .filter((part): part is string => part !== null)
        .join(' · ');

/** The publish button and the sentence under it. */
export const publishView = (s: AudioSummary, timeZone?: string): { label: string; note: string; enabled: boolean; tone: Tone } => {
  switch (s.publish) {
    case 'empty':
      return { label: 'Publier', note: 'Ajoutez une annonce pour pouvoir publier.', enabled: false, tone: 'neutral' };
    case 'fix':
      return {
        label: 'Publier',
        note: `${s.toFix === 1 ? 'Une annonce est à compléter' : `${s.toFix} annonces sont à compléter`} avant de publier.`,
        enabled: false,
        tone: 'warn',
      };
    case 'missing':
      return {
        label: 'Publier',
        note: `${s.toRecord === 1 ? 'Il reste une voix à enregistrer' : `Il reste ${s.toRecord} voix à enregistrer`} avant de publier.`,
        enabled: false,
        tone: 'warn',
      };
    case 'ready':
      return {
        label: s.lastPublished ? 'Publier les changements' : 'Publier',
        note: 'Les coureurs reçoivent cette version la prochaine fois qu’ils ouvrent l’application.',
        enabled: true,
        tone: 'info',
      };
    case 'current':
      return {
        label: 'Publié',
        note: s.lastPublished ? `Les coureurs ont cette version depuis le ${dayFr(s.lastPublished.at, timeZone)}.` : 'Les coureurs ont cette version.',
        enabled: false,
        tone: 'good',
      };
  }
};

export const PUBLISH_CONFIRM = 'Publier ces annonces ? Les coureurs les reçoivent la prochaine fois qu’ils ouvrent l’application.';

/** The start ceremony, explained where it is edited. */
export const CEREMONY_COPY = {
  title: 'Le départ, seconde par seconde',
  intro: 'Quand le coureur appuie sur « Départ », ces sons s’enchaînent sans pause, dans cet ordre.',
  countdown: 'Les chiffres à l’écran suivent ce son : écrivez un chiffre par seconde (« Dix. Neuf. … Un. »).',
  gun: 'Le chrono démarre à la première seconde de ce son.',
  noGun: 'Pas de coup de pistolet : le chrono démarre à la fin de la dernière annonce du départ.',
  noCountdown: 'Pas de compte à rebours : l’écran n’affiche pas de chiffres avant le départ.',
  none: 'Pas encore de cérémonie : le coureur voit un compte à rebours silencieux de cinq secondes. Pour la créer, choisissez « Avant le départ (cérémonie) » dans « Quand ».',
  listen: 'Écouter le départ',
  before: 'avant le chrono',
} as const;

/** "142 caractères · environ 9 s" under the text. */
export const textMeasure = (length: number, seconds: number): string => `${plural(length, 'caractère', 'caractères')} · environ ${seconds} s`;

export const UPLOAD_ERRORS = {
  empty: 'Le fichier est vide.',
  too_big: 'Le fichier dépasse 5 Mo. Envoyez un MP3 plus court ou plus compressé.',
  not_audio: 'Ce fichier n’est pas un son MP3, M4A ou WAV.',
} as const;

/** The sentences the studio's browser script paints itself (it never writes its own copy). */
export const CLIENT_COPY = {
  sound: SOUND_OPTIONS,
  fallbackHint: FALLBACK_HINT,
  voiceHint: 'écrivez comme vous parlez',
  phase: PHASE_COPY,
  ceremony: CEREMONY_COPY,
} as const;

/** Who wrote an AI text, said to the organizer: Claude, or the stand-in while the gateway has no Anthropic key. */
export const WRITER_NOTE: Record<'claude' | 'workers-ai', string> = {
  claude: 'Écrit par Claude.',
  'workers-ai': 'Écrit par Llama 3.3 (Workers AI) : Claude n’est pas encore branché sur la passerelle IA.',
};
