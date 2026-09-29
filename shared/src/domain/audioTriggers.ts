import { CueMomentSchema } from '../schemas/audio';
import type { AudioEvent, AudioPack, CueTrigger } from '../schemas/audio';

/** What the trigger function needs to know about the run. A projection of RunState. */
export type TriggerState = {
  phase: 'idle' | 'running' | 'finished' | 'abandoned';
  distanceM: number;
  elapsedMs: number;
  paceSecPerKm: number | null;
};

export type Firing = { event: AudioEvent; key: string };

/** Split and repeating pace events fire once per bucket; the key tells them apart. */
const keyFor = (event: AudioEvent, state: TriggerState): string | null => {
  const { trigger } = event;
  switch (trigger.kind) {
    case 'cue':
      // Played before the clock starts, by the ceremony (see ceremonySequence), never by the run.
      return null;
    case 'start':
      return state.phase !== 'idle' ? event.id : null;
    case 'finish':
      return state.phase === 'finished' ? event.id : null;
    case 'distance':
      return state.phase !== 'idle' && state.distanceM >= trigger.meters ? event.id : null;
    case 'elapsed':
      return state.phase !== 'idle' && state.elapsedMs >= trigger.seconds * 1000 ? event.id : null;
    case 'split': {
      const bucket = Math.floor(state.distanceM / trigger.everyMeters);
      return state.phase === 'running' && bucket >= 1 ? `${event.id}#${bucket}` : null;
    }
    case 'pace': {
      if (state.phase !== 'running' || state.paceSecPerKm === null || state.distanceM < trigger.afterMeters) return null;
      const slow = trigger.slowerThan !== undefined && state.paceSecPerKm > trigger.slowerThan;
      const fast = trigger.fasterThan !== undefined && state.paceSecPerKm < trigger.fasterThan;
      if (!slow && !fast) return null;
      const bucket = Math.floor(state.distanceM / 1000);
      return event.once ? event.id : `${event.id}#${bucket}`;
    }
  }
};

/**
 * Pure: which events should play now, given what already fired. Highest priority first.
 * The app plays them and records the keys; `fired` is that record.
 */
export const nextEvents = (state: TriggerState, pack: Pick<AudioPack, 'events'>, fired: ReadonlySet<string>): Firing[] =>
  pack.events
    .map((event) => ({ event, key: keyFor(event, state) }))
    .filter((f): f is Firing => f.key !== null && !fired.has(f.key))
    .sort((a, b) => b.event.priority - a.event.priority);

/** Only the finish survives a pause; the rest of a missed backlog is dropped. */
export const afterPause = (firings: Firing[]): Firing[] => firings.filter((f) => f.event.trigger.kind === 'finish');

type Triggered = Pick<AudioEvent, 'trigger'>;
export type CueLine<E extends Triggered = AudioEvent> = E & { trigger: CueTrigger };

/** The start ceremony: its lines in play order, which one drives the digits and which one is the gun. */
export type Ceremony<E extends Triggered = AudioEvent> = {
  lines: CueLine<E>[];
  /**
   * The one line whose remaining time the screen shows as digits: the last `countdown` line (they
   * all play before the gun). Any other `countdown` line plays like an `armed` one. Null: no digits.
   */
  countdownIndex: number | null;
  /** The line whose first second starts the clock; `lines.length` when there is no gun line, the clock then starts as the last line ends. */
  gunIndex: number;
};

const MOMENTS = CueMomentSchema.options;
const isCue = <E extends Triggered>(event: E): event is CueLine<E> => event.trigger.kind === 'cue';

/**
 * Pure: the start ceremony of a pack. Every cue line, `armed` then `countdown` then `gun`, by
 * `order` within a moment and pack order on ties. The app plays them back to back once the
 * runner presses Start and starts the clock when the gun line starts playing, so "Partez !"
 * and 00:00 are the same instant. `null` for a pack with no cue: the app keeps its silent
 * visual countdown, and an older pack's ceremony (`start`, `elapsed: 0`) fires at the gun.
 */
export const ceremonySequence = <E extends Triggered>(pack: { events: readonly E[] }): Ceremony<E> | null => {
  const lines = pack.events
    .filter(isCue)
    .map((event, i) => ({ event, i }))
    .sort((a, b) => MOMENTS.indexOf(a.event.trigger.at) - MOMENTS.indexOf(b.event.trigger.at) || a.event.trigger.order - b.event.trigger.order || a.i - b.i)
    .map(({ event }) => event);
  if (lines.length === 0) return null;
  const gun = lines.findIndex((line) => line.trigger.at === 'gun');
  const countdown = lines.reduce<number | null>((last, line, i) => (line.trigger.at === 'countdown' ? i : last), null);
  return { lines, countdownIndex: countdown, gunIndex: gun < 0 ? lines.length : gun };
};

/** How far ahead of the number it names a digit may turn: a status arrives up to one update late. */
const DIGIT_LEAD_S = 0.1;

/**
 * Pure: the digit the screen shows while the countdown file plays, from its own remaining time.
 * Never more than the file's nominal whole seconds: MP3 padding makes a ten-second file report
 * 10.03 s, which would otherwise open on « 11 ». Never less than 1: « 0 » is the gun's.
 */
export const countdownDigit = (remainingS: number, durationS: number): number => {
  const nominal = Math.max(1, Math.round(durationS));
  return Math.min(nominal, Math.max(1, Math.ceil(remainingS - DIGIT_LEAD_S)));
};
