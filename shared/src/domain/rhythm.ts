import type { AudioEvent, AudioPack } from '../schemas/audio';
import { ceremonySequence, nextEvents, secondsToNextPlaced } from './audioTriggers';
import type { Firing } from './audioTriggers';
import { isSlow, pickTake, readRun } from './runReading';
import type { Pause, RunReading } from './runReading';
import { takeOf } from './takes';
import type { RunState } from './tracker';

/**
 * The rhythm director (PRODUCTION.md): between the lines placed on the course, the race must
 * not go quiet for minutes. When the silence would run past the course's `maxGapS`, it plays a
 * filler (a line with the `filler` trigger: the crowd shouting the runner's name, a word from
 * the speaker), never so close to the next placed line that the two would crowd each other.
 * A runner who runs again after a stop or a walk gets a word for it. Pure.
 */

/** The longest the race stays quiet while the runner runs, when the course does not say. */
export const MAX_GAP_S = 150;
/** No filler when the next placed line is this close: it is about to speak anyway. */
export const CLEAR_AHEAD_S = 40;
/** A restart word needs only this much room before the next placed line: it is short, and it is now or never. */
const RESTART_CLEAR_S = 15;
/** A filler only after at least this much quiet: it is a beat, not a stream. */
const MIN_QUIET_S = 30;
/** A big moment (a placed line this important or more)… */
const BIG_PRIORITY = 7;
/** …keeps the kilometre call that comes this soon after it quiet: « Kilomètre neuf » over the Golden km would step on it. */
const SPLIT_YIELDS_MS = 60_000;

/** A line the run already said: the run store's record, and the director's memory. `missed`: it fell due in a GPS gap, nobody heard it. */
export type Said = { eventId: string; key: string; take?: string; elapsedMs: number; missed?: boolean };

/** A line due now, with the take to say. `quiet`: due, but kept quiet (a kilometre call right after a big moment). */
export type Due = Firing & { take?: string; quiet?: boolean };

type Sounds = Pick<AudioPack, 'events' | 'files'>;

const secondsOf = (pack: Sounds, key: string | undefined): number => (key ? (pack.files[key]?.seconds ?? 0) : 0);

/** How long a said line keeps the race sounding: its voice, or the ambiance it brought, whichever is longer. */
const soundsFor = (pack: Sounds, event: AudioEvent, take?: string): number => Math.max(secondsOf(pack, takeOf(event, take)?.key), secondsOf(pack, event.under));

/** When the race last stops sounding, in run time (ms): the gun's ambiance, then every line heard since. */
const soundEndMs = (pack: Sounds, heard: Said[]): number => {
  const gun = ceremonySequence(pack);
  const gunLine = gun ? gun.lines[gun.gunIndex] : undefined;
  return heard.reduce((end, s) => {
    const event = pack.events.find((e) => e.id === s.eventId);
    return event ? Math.max(end, s.elapsedMs + soundsFor(pack, event, s.take) * 1000) : end;
  }, gunLine ? soundsFor(pack, gunLine) * 1000 : 0);
};

/**
 * Whether a silence needs a filler now. `quietS`: since the race last made a sound; `toNextS`:
 * until the next placed line. A silence that would outlast `maxGapS` is cut in two evenly, and
 * filled at the latest `CLEAR_AHEAD_S` before it reaches the maximum; never within
 * `CLEAR_AHEAD_S` of the next placed line, which is about to speak anyway.
 */
export const gapToFill = (quietS: number, toNextS: number, maxGapS: number): boolean =>
  quietS >= MIN_QUIET_S && toNextS > CLEAR_AHEAD_S && quietS + toNextS > maxGapS && quietS >= Math.min(maxGapS - CLEAR_AHEAD_S, (quietS + toNextS) / 2);

const heardOf = (heard: Said[], eventId: string) => heard.filter((s) => s.eventId === eventId).map((s) => s.take);

/** The filler for the moment: of the ones that can say it, the least said, then the script's order. */
const fillerFor = (pack: Pick<AudioPack, 'events'>, heard: Said[], reading: RunReading, restart: boolean): Due | null => {
  const fillers = pack.events.filter((e) => e.trigger.kind === 'filler' && (!restart || e.takes?.some((t) => t.when === 'restart')));
  const event = fillers.map((e, i) => ({ e, i, n: heardOf(heard, e.id).length })).sort((a, b) => a.n - b.n || a.i - b.i)[0]?.e;
  if (!event) return null;
  const takes = heardOf(heard, event.id);
  const take = pickTake(event, reading, takes, restart ? 'restart' : undefined);
  return { event, key: `${event.id}#${takes.length + 1}`, ...(take ? { take } : {}) };
};

/**
 * Pure: every line due now, with the take each one says. The lines placed on the course first
 * (`nextEvents`); when none is due, one filler: a restart word if the runner just ran again after
 * a stop and nothing was said since, else a cheer if the silence is too long. `said`: what the
 * run fired so far (missed lines included: they are not due again, but nobody heard them);
 * `pause`: the runner's stops (`followPause`).
 */
export const dueLines = (state: RunState, pack: Pick<AudioPack, 'events' | 'files' | 'maxGapS'>, said: Said[], pause: Pause): Due[] => {
  const fired = new Set(said.map((s) => s.key));
  const heard = said.filter((s) => !s.missed);
  const reading = readRun(state, pause);
  const lastBig = heard.filter((s) => (pack.events.find((e) => e.id === s.eventId)?.priority ?? 0) >= BIG_PRIORITY).at(-1);
  const yields = (f: Firing) => f.event.trigger.kind === 'split' && lastBig !== undefined && state.elapsedMs - lastBig.elapsedMs < SPLIT_YIELDS_MS;
  const placed = nextEvents(state, pack, fired).map((f): Due => {
    if (yields(f)) return { ...f, quiet: true };
    const take = pickTake(f.event, reading, heardOf(heard, f.event.id));
    return take ? { ...f, take } : f;
  });
  if (placed.length > 0 || state.phase !== 'running') return placed;
  const quietS = (state.elapsedMs - soundEndMs(pack, heard)) / 1000;
  const toNextS = secondsToNextPlaced(state, pack, fired);
  const lastHeardMs = heard[heard.length - 1]?.elapsedMs ?? 0;
  // Just after a stop the recent pace still holds the stop: the run's average says better when the next line comes.
  const restart =
    reading.restart && pause.last !== null && lastHeardMs < pause.last.endedMs && quietS >= 0 && secondsToNextPlaced(state, pack, fired, state.avgPaceSecPerKm) > RESTART_CLEAR_S;
  // A cheer needs a runner known to be running: a pace, and no stop or walk.
  const running = state.paceSecPerKm !== null && !isSlow(state);
  const filler = (restart ? fillerFor(pack, heard, reading, true) : null) ?? (running && gapToFill(quietS, toNextS, pack.maxGapS ?? MAX_GAP_S) ? fillerFor(pack, heard, reading, false) : null);
  return filler ? [filler] : [];
};
