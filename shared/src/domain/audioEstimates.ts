import type { AudioEvent, AudioTrigger } from '../schemas/audio';
import type { Locale } from '../i18n/index';
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

const metersAtSeconds = (seconds: number, paceSecPerKm: number): number => (paceSecPerKm > 0 ? (seconds / paceSecPerKm) * 1000 : 0);

const clamp = (m: number, distanceM: number) => Math.max(0, Math.min(distanceM, m));

/**
 * Where every event of a script is expected to fire, for a runner holding `paceSecPerKm`.
 * Authoring-time only: it turns time-based and recurring triggers into positions along the
 * course so the studio can draw them on the map and on the timeline. Pace triggers have no
 * position by nature and come back with `meters: null`.
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
  return [...firings].sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity) || a.occurrence - b.occurrence);
};

const TRIGGER_TEXT = {
  fr: { start: 'au départ', finish: 'à l’arrivée', distance: 'à', elapsed: 'après', split: 'tous les', pace: 'allure', after: 'après' },
  en: { start: 'at the start', finish: 'at the finish', distance: 'at', elapsed: 'after', split: 'every', pace: 'pace', after: 'past' },
} as const;

/** One line describing a trigger, for the studio's event list. */
export const describeTrigger = (trigger: AudioTrigger, locale: Locale = 'fr'): string => {
  const w = TRIGGER_TEXT[locale];
  switch (trigger.kind) {
    case 'start':
      return w.start;
    case 'finish':
      return w.finish;
    case 'distance':
      return `${w.distance} ${Math.round(trigger.meters)} m`;
    case 'elapsed':
      return `${w.elapsed} ${Math.round(trigger.seconds)} s`;
    case 'split':
      return `${w.split} ${Math.round(trigger.everyMeters)} m`;
    case 'pace': {
      const band = [
        trigger.slowerThan === undefined ? '' : `> ${Math.round(trigger.slowerThan)} s/km`,
        trigger.fasterThan === undefined ? '' : `< ${Math.round(trigger.fasterThan)} s/km`,
      ]
        .filter((s) => s.length > 0)
        .join(' ');
      return `${w.pace} ${band} ${w.after} ${Math.round(trigger.afterMeters)} m`.replace(/\s+/g, ' ').trim();
    }
  }
};

/** The first firing of each event: what the event list is ordered by. */
export const firstFirings = (firings: EstimatedFiring[]): Map<string, EstimatedFiring> =>
  firings.reduce((acc, f) => (acc.has(f.eventId) ? acc : acc.set(f.eventId, f)), new Map<string, EstimatedFiring>());
