import { z } from 'zod';
import { formatKm } from '@sivoov/shared';
import type { Race, RunVerdict } from '@sivoov/shared';
import type { Exclusion, RunFilter } from '../../db/runQueries';
import { dateFr, dateTimeFr, distanceName } from './format';
import type { Tone } from './ui';

/** The words of the "Activités" screens, in one place. */

export const FILTER_LABELS: Record<RunFilter, string> = {
  all: 'Toutes',
  finished: 'Arrivés',
  not_ranked: 'Hors classement',
  not_finished: 'Pas arrivés',
  running: 'En course',
  excluded: 'Écartés',
  simulated: 'Essais simulés',
};

/** What an empty list means, per filter. */
export const FILTER_EMPTY: Record<RunFilter, { title: string; text: string }> = {
  all: { title: 'Personne n’a encore couru.', text: 'Les courses apparaîtront ici dès qu’un coureur aura terminé ou envoyé son fichier.' },
  finished: { title: 'Aucun coureur arrivé pour le moment.', text: 'Un coureur apparaît ici quand il a parcouru toute la distance.' },
  not_ranked: {
    title: 'Aucune course hors classement.',
    text: 'Une course terminée avant l’ouverture de la course, après sa fermeture ou sur une autre distance que celle du coureur apparaît ici. Elle ne compte pas dans les résultats.',
  },
  not_finished: { title: 'Aucune course interrompue.', text: 'Les courses arrêtées avant la distance apparaissent ici. Elles ne comptent pas dans les résultats.' },
  running: { title: 'Personne n’est en course en ce moment.', text: 'Une course apparaît ici pendant que le coureur court, si son téléphone a du réseau.' },
  excluded: { title: 'Aucun temps écarté.', text: 'Quand vous écartez un temps depuis le détail d’une activité, il apparaît ici. Vous pouvez le rétablir à tout moment.' },
  simulated: { title: 'Aucun essai simulé.', text: 'Les essais faits avec la simulation de l’application apparaissent ici. Ils ne comptent jamais.' },
};

/** How the run reached us. */
export const howLabel = (source: string, platform: string | null | undefined): string => {
  if (source === 'upload') return 'Fichier envoyé';
  if (source === 'simulation') return 'Simulation';
  if (platform === 'android') return 'Application Android';
  if (platform === 'ios') return 'Application iOS';
  if (platform === 'web') return 'Application, navigateur';
  return 'Application';
};

/** The phone's system, as its owner would name it. */
export const PLATFORM_LABELS: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Navigateur' };

/** "18,40 km" */
export const km = (meters: number, digits = 2): string => formatKm(meters, 'fr', digits);
/** "18,40", for a column already titled "km". */
export const kmNumber = (meters: number, digits = 2): string => km(meters, digits).replace(' km', '');

/** Why an organizer sets a time aside. The stored text is the label, plus the note when there is one. */
export const ExcludeReasonSchema = z.enum(['not_running', 'gps', 'duplicate', 'other'], { error: 'Choisissez un motif.' });
export type ExcludeReason = z.infer<typeof ExcludeReasonSchema>;
export const EXCLUDE_REASONS: ReadonlyArray<{ value: ExcludeReason; label: string }> = [
  { value: 'not_running', label: 'Ce n’est pas une course à pied (vélo, voiture, etc.)' },
  { value: 'gps', label: 'Problème de GPS' },
  { value: 'duplicate', label: 'Doublon' },
  { value: 'other', label: 'Autre' },
];

export const reasonText = (reason: ExcludeReason, note: string): string => {
  const label = EXCLUDE_REASONS.find((r) => r.value === reason)?.label ?? '';
  return note.trim() ? `${label}. ${note.trim()}` : label;
};

export const DONE_MESSAGES: Record<string, string> = {
  excluded: 'Temps écarté. Il n’apparaît plus dans les résultats ni dans les téléchargements.',
  restored: 'Temps rétabli.',
};

type VerdictInput = {
  verdict: RunVerdict;
  distanceM: number;
  courseDistanceM: number;
  exclusion: Exclusion | null;
  race: Pick<Race, 'windowStart' | 'windowEnd' | 'timezone'>;
  /** The distance of the course run, and the one the runner is entered on. */
  distanceKey: string;
  entrantDistanceKey: string;
};

/** One plain sentence when the time does not count in the results, and why. Null when it counts. */
export const verdictSentence = ({ verdict, distanceM, courseDistanceM, exclusion, race, distanceKey, entrantDistanceKey }: VerdictInput): { tone: Tone; text: string } | null => {
  const timezone = race.timezone;
  const covered = `${km(distanceM, 1)} parcourus sur ${km(courseDistanceM, 1)}`;
  switch (verdict) {
    case 'counts':
      return null;
    case 'excluded':
      return {
        tone: 'bad',
        text: `Ce temps ne compte pas dans les résultats : il a été écarté${exclusion ? ` le ${dateTimeFr(exclusion.at, timezone)} par ${exclusion.by}. Motif : ${exclusion.reason.replace(/[.!?\s]+$/, '')}` : ''}.`,
      };
    case 'simulated':
      return { tone: 'info', text: 'Ce temps ne compte pas dans les résultats : c’est un essai simulé, fait pour tester l’application.' };
    case 'rehearsal':
      return { tone: 'info', text: `Ce temps ne compte pas dans les résultats : c’est une répétition, courue avant l’ouverture de la course le ${dateFr(race.windowStart, timezone)}.` };
    case 'closed':
      return { tone: 'warn', text: `Ce temps ne compte pas dans les résultats : couru après la fermeture de la course le ${dateFr(race.windowEnd, timezone)}.` };
    case 'other_distance':
      return {
        tone: 'warn',
        text: `Ce temps ne compte pas dans les résultats : couru sur le parcours ${distanceName(distanceKey)}, alors que le coureur est inscrit sur ${distanceName(entrantDistanceKey)}. Si c’est sa bonne distance, changez-la sur sa fiche.`,
      };
    case 'stopped':
      return { tone: 'warn', text: `Ce temps ne compte pas dans les résultats : arrêt avant l’arrivée, ${covered}.` };
    case 'running':
      return { tone: 'info', text: `Course en cours, ${covered}. Le temps comptera une fois la ligne d’arrivée franchie.` };
    case 'planned':
      return { tone: 'neutral', text: 'Cette course n’a pas encore commencé.' };
  }
};
