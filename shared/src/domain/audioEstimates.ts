import type { AudioEvent, AudioTrigger } from '../schemas/audio';
import type { Locale } from '../i18n/index';
import { ceremonySequence } from './audioTriggers';
import { formatKm } from './format';

export type EstimatedFiring = {
  eventId: string;
  kind: AudioTrigger['kind'];
  /** Distance along the course, in official meters, where this firing is expected. */
  meters: number | null;
  /** 0 for a one-shot event, 1..n for each occurrence of a recurring one. */
  occurrence: number;
  /** True for the repeated occurrences of a recurring event: drawn faint on the map. */
  recurring: boolean;
  label: string;
};

const PACE_LABEL: Record<Locale, string> = { fr: 'selon l’allure', en: 'pace-based' };
const FILLER_LABEL: Record<Locale, string> = { fr: 'silences', en: 'in silences' };
// Short: it fills the studio's position column, where "0,2 km" sits for the others.
const CUE_LABEL: Record<Locale, string> = { fr: 'avant', en: 'before' };

const metersAtSeconds = (seconds: number, paceSecPerKm: number): number => (paceSecPerKm > 0 ? (seconds / paceSecPerKm) * 1000 : 0);

const clamp = (m: number, distanceM: number) => Math.max(0, Math.min(distanceM, m));

/**
 * Where every event of a script is expected to fire, for a runner holding `paceSecPerKm`.
 * Authoring-time only: it turns time-based and recurring triggers into positions along the
 * course so the studio can draw them on the map and on the timeline. Pace triggers have no
 * position by nature and come back with `meters: null`. The start ceremony (cue triggers)
 * sits on the start line, ahead of everything else there, in the order it is played.
 */
export const estimateFirings = (
  events: Pick<AudioEvent, 'id' | 'trigger'>[],
  distanceM: number,
  paceSecPerKm: number,
  locale: Locale = 'fr',
): EstimatedFiring[] => {
  const label = (meters: number | null) => (meters === null ? PACE_LABEL[locale] : formatKm(meters, locale, 1));
  const one = (eventId: string, kind: AudioTrigger['kind'], meters: number | null): EstimatedFiring => ({
    eventId,
    kind,
    meters,
    occurrence: 0,
    recurring: false,
    label: label(meters),
  });
  const firings = events.flatMap<EstimatedFiring>(({ id, trigger }) => {
    switch (trigger.kind) {
      case 'cue':
        return [{ ...one(id, 'cue', 0), label: CUE_LABEL[locale] }];
      case 'start':
        return [one(id, 'start', 0)];
      case 'finish':
        return [one(id, 'finish', distanceM)];
      case 'distance':
        return [one(id, 'distance', clamp(trigger.meters, distanceM))];
      case 'elapsed':
        return [one(id, 'elapsed', clamp(metersAtSeconds(trigger.seconds, paceSecPerKm), distanceM))];
      case 'pace':
        return [one(id, 'pace', null)];
      case 'filler':
        return [{ ...one(id, 'filler', null), label: FILLER_LABEL[locale] }];
      case 'split': {
        const count = Math.floor(distanceM / trigger.everyMeters);
        return Array.from({ length: Math.max(0, count) }, (_, i) => {
          const meters = (i + 1) * trigger.everyMeters;
          return { eventId: id, kind: 'split' as const, meters, occurrence: i + 1, recurring: i > 0, label: label(meters) };
        });
      }
    }
  });
  // Ordered by position so the studio list, the map and the timeline agree; pace events last.
  const ceremony = (ceremonySequence({ events })?.lines ?? []).map((line) => line.id);
  const beforeGun = (f: EstimatedFiring) => (f.kind === 'cue' ? ceremony.indexOf(f.eventId) : ceremony.length);
  return [...firings].sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity) || beforeGun(a) - beforeGun(b) || a.occurrence - b.occurrence);
};
