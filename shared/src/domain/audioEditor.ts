import { CueMomentSchema } from '../schemas/audio';
import type { AudioTrigger, CueMoment } from '../schemas/audio';
import { formatPace } from './format';

/**
 * The studio editor speaks like a race director: kilometres with a decimal comma, minutes,
 * paces as "6:30". The schema stores meters and seconds. These functions are the conversion
 * rules, and the words the admin uses to say when an announcement plays. The browser half of
 * the studio (api/src/pages/org/studio.client.js) mirrors `triggerFromEditor`; keep them in step.
 */

/** "5,2", "5.2", " 5 " -> 5.2. Empty or anything else -> null. What a French organizer types. */
export const parseDecimal = (text: string): number | null => {
  const clean = text.trim().replace(/\s+/g, '').replace(',', '.');
  return /^(\d+(\.\d*)?|\.\d+)$/.test(clean) ? Number(clean) : null;
};

/** 5.2 -> "5,2", 21.0975 -> "21,0975": enough decimals that reading it back gives the same value. */
export const decimalFr = (n: number, maxDigits = 4): string => String(Number(n.toFixed(maxDigits))).replace('.', ',');

/** 5200 m -> "5,2" (km, for an input). */
export const kmInput = (meters: number): string => decimalFr(meters / 1000);
/** "5,2" km -> 5200 m, to the decimetre. */
export const metersFromKm = (text: string): number | null => {
  const km = parseDecimal(text);
  return km === null ? null : Math.round(km * 10_000) / 10;
};

/** 90 s -> "1,5" (minutes, for an input). */
export const minutesInput = (seconds: number): string => decimalFr(seconds / 60);
/** "1,5" minutes -> 90 s, to the tenth of a second. */
export const secondsFromMinutes = (text: string): number | null => {
  const minutes = parseDecimal(text);
  return minutes === null ? null : Math.round(minutes * 600) / 10;
};

/** "6:30", "6" or "6,5" (min/km) -> 390 s/km. Seconds past 59 are refused. */
export const paceFromInput = (text: string): number | null => {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (clock) return Number(clock[2]) < 60 ? Number(clock[1]) * 60 + Number(clock[2]) : null;
  const minutes = parseDecimal(text);
  return minutes === null || minutes === 0 ? null : Math.round(minutes * 60);
};

/** The editor's "Quand" fields, as typed. Only the ones the chosen kind needs are read. */
export type EditorWhen = {
  kind: AudioTrigger['kind'];
  km: string;
  minutes: string;
  everyKm: string;
  slowerThan: string;
  fasterThan: string;
  afterKm: string;
  /** Before the start: which moment of the ceremony, and the play order within it. */
  cueAt: string;
  cueOrder: string;
};

/** What the inputs show for a trigger. Fields of the other kinds get the value they would start with. */
export const editorFromTrigger = (trigger: AudioTrigger): EditorWhen => ({
  kind: trigger.kind,
  km: trigger.kind === 'distance' ? kmInput(trigger.meters) : '',
  minutes: trigger.kind === 'elapsed' ? minutesInput(trigger.seconds) : '',
  everyKm: trigger.kind === 'split' ? kmInput(trigger.everyMeters) : '1',
  slowerThan: trigger.kind === 'pace' && trigger.slowerThan !== undefined ? formatPace(trigger.slowerThan) : '',
  fasterThan: trigger.kind === 'pace' && trigger.fasterThan !== undefined ? formatPace(trigger.fasterThan) : '',
  afterKm: trigger.kind === 'pace' ? kmInput(trigger.afterMeters) : '1',
  cueAt: trigger.kind === 'cue' ? trigger.at : 'armed',
  cueOrder: trigger.kind === 'cue' ? String(trigger.order) : '1',
});

/**
 * The trigger the schema stores, from what the organizer typed. Null when a number the kind
 * needs is missing or unreadable, so the editor can say which field to fix.
 */
export const triggerFromEditor = (when: EditorWhen): AudioTrigger | null => {
  switch (when.kind) {
    case 'cue': {
      const at = CueMomentSchema.safeParse(when.cueAt);
      const order = /^\d+$/.test(when.cueOrder.trim()) ? Number(when.cueOrder.trim()) : null;
      return at.success && order !== null ? { kind: 'cue', at: at.data, order } : null;
    }
    case 'start':
    case 'finish':
      return { kind: when.kind };
    case 'distance': {
      const meters = metersFromKm(when.km);
      return meters === null ? null : { kind: 'distance', meters };
    }
    case 'elapsed': {
      const seconds = secondsFromMinutes(when.minutes);
      return seconds === null ? null : { kind: 'elapsed', seconds };
    }
    case 'split': {
      const everyMeters = metersFromKm(when.everyKm);
      return everyMeters === null || everyMeters === 0 ? null : { kind: 'split', everyMeters };
    }
    case 'pace': {
      const afterMeters = when.afterKm.trim() === '' ? 0 : metersFromKm(when.afterKm);
      const slowerThan = when.slowerThan.trim() === '' ? undefined : paceFromInput(when.slowerThan);
      const fasterThan = when.fasterThan.trim() === '' ? undefined : paceFromInput(when.fasterThan);
      if (afterMeters === null || slowerThan === null || fasterThan === null) return null;
      if (slowerThan === undefined && fasterThan === undefined) return null;
      return {
        kind: 'pace',
        afterMeters,
        ...(slowerThan === undefined ? {} : { slowerThan }),
        ...(fasterThan === undefined ? {} : { fasterThan }),
      };
    }
  }
};

/** 45 -> "45 s", 90 -> "1 min 30 s", 720 -> "12 min", 3600 -> "1 h", 5400 -> "1 h 30". */
export const durationFr = (seconds: number): string => {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
};

/** When an announcement plays, in the words a race director uses: "Au km 5,2", "Tous les km". */
/** The start ceremony's moments, in the order they play, as the studio names them. */
export const CUE_WORDS: Record<CueMoment, string> = {
  armed: 'Sur la ligne',
  countdown: 'Compte à rebours',
  gun: 'Coup de pistolet',
};

export const whenInWords = (trigger: AudioTrigger): string => {
  switch (trigger.kind) {
    case 'cue':
      return `Avant le départ · ${CUE_WORDS[trigger.at]}`;
    case 'start':
      return 'Au départ';
    case 'finish':
      return 'À l’arrivée';
    case 'distance':
      return trigger.meters <= 0 ? 'Au départ' : `Au km ${decimalFr(trigger.meters / 1000, 2)}`;
    case 'elapsed':
      return trigger.seconds <= 0 ? 'Au départ' : `À ${durationFr(trigger.seconds)} de course`;
    case 'split':
      return trigger.everyMeters === 1000 ? 'Tous les km' : `Tous les ${decimalFr(trigger.everyMeters / 1000, 2)} km`;
    case 'pace':
      if (trigger.slowerThan !== undefined && trigger.fasterThan !== undefined) return 'Si l’allure change';
      if (trigger.slowerThan !== undefined) return 'Si le coureur ralentit';
      if (trigger.fasterThan !== undefined) return 'Si le coureur va trop vite';
      return 'Selon l’allure';
  }
};

/** The four moments the studio groups announcements by, in running order. */
export const MOMENTS = ['start', 'course', 'always', 'finish'] as const;
export type Moment = (typeof MOMENTS)[number];

/**
 * Which moment an announcement belongs to. Repeating ones (every km, pace) play all along;
 * a distance or a time of zero plays with the gun; a distance at or past the line is the finish.
 */
export const momentOf = (trigger: AudioTrigger, distanceM: number): Moment => {
  switch (trigger.kind) {
    case 'cue':
    case 'start':
      return 'start';
    case 'finish':
      return 'finish';
    case 'split':
    case 'pace':
      return 'always';
    case 'distance':
      return trigger.meters <= 0 ? 'start' : trigger.meters >= distanceM ? 'finish' : 'course';
    case 'elapsed':
      return trigger.seconds <= 0 ? 'start' : 'course';
  }
};

/** A French voice reads about 15 characters a second: how long a text lasts, at least one second. */
export const SPEECH_CHARS_PER_SECOND = 15;
export const speechSeconds = (text: string): number => Math.max(1, Math.round(text.trim().length / SPEECH_CHARS_PER_SECOND));
