import type { AudioCategory, AudioTrigger, Moment } from '@sivoov/shared';
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
  always: { title: 'Pendant toute la course', hint: 'Celles qui reviennent : chaque kilomètre, les conseils d’allure.', add: 'Ajouter une annonce qui revient' },
  finish: { title: 'À l’arrivée', hint: 'Quand le coureur franchit la ligne.', add: 'Ajouter à l’arrivée' },
};

export const WHEN_OPTIONS: { key: AudioTrigger['kind']; label: string }[] = [
  { key: 'start', label: 'Au départ' },
  { key: 'distance', label: 'À un kilomètre précis' },
  { key: 'elapsed', label: 'Après un temps de course' },
  { key: 'split', label: 'Tous les N kilomètres' },
  { key: 'pace', label: 'Selon l’allure du coureur' },
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
  slots: 'Des mots entre accolades, comme {km}, remplacés pour chaque coureur. Une annonce qui en contient s’affiche sur l’écran du coureur, sans voix pour l’instant.',
  key: 'Le nom du son dans l’application. Deux annonces ne peuvent pas porter le même.',
};

/** 0 to 10, with words on the three values a race director needs. */
export const PRIORITY_OPTIONS: { value: number; label: string }[] = Array.from({ length: 11 }, (_, i) => 10 - i).map((value) => ({
  value,
  label: value === 10 ? '10, la plus haute' : value === 5 ? '5, normale' : value === 0 ? '0, la plus basse' : String(value),
}));

/** Where a line's sound comes from: the rendered voice, the organizer's file, or the screen only (slots). */
export type LineSource = 'voice' | 'upload' | 'template';

export const lineStatusView = (source: LineSource, ready: boolean): { label: string; tone: Tone } => {
  if (source === 'template') return { label: 'À l’écran', tone: 'neutral' };
  if (source === 'upload') return ready ? { label: 'Fichier audio', tone: 'info' } : { label: 'Fichier introuvable', tone: 'bad' };
  return ready ? { label: 'Voix prête', tone: 'good' } : { label: 'À enregistrer', tone: 'warn' };
};

/** "12 sept." in the race's timezone. */
export const dayFr = (iso: string, timeZone = 'Europe/Paris'): string =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone }).format(new Date(iso));

export type PublishState = 'empty' | 'missing' | 'ready' | 'current';

export type AudioSummary = {
  lines: number;
  /** Voice lines whose current text has no rendered voice yet (and uploads whose file is gone). */
  toRecord: number;
  uploads: number;
  onScreen: number;
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

/** "142 caractères · environ 9 s" under the text. */
export const textMeasure = (length: number, seconds: number): string => `${plural(length, 'caractère', 'caractères')} · environ ${seconds} s`;

export const UPLOAD_ERRORS = {
  empty: 'Le fichier est vide.',
  too_big: 'Le fichier dépasse 5 Mo. Envoyez un MP3 plus court ou plus compressé.',
  not_audio: 'Ce fichier n’est pas un son MP3, M4A ou WAV.',
} as const;
