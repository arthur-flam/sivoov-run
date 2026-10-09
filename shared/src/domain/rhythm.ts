import type { AudioEvent, AudioPack } from '../schemas/audio';
import { ceremonySequence, lineLeadM, nextEvents } from './audioTriggers';
import type { Firing } from './audioTriggers';
import { NO_PAUSE, followPause, isSlow, pickTake, readRun } from './runReading';
import type { Pause, RunReading } from './runReading';
import { idleRun } from './tracker';
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
/** A filler only after at least this much quiet: it is a beat, not a stream. */
const MIN_QUIET_S = 30;

/** A line the run already said: the run store's record, and the director's memory. */
export type Said = { eventId: string; key: string; take?: string; elapsedMs: number };

/** A line due now, with the take to say. */
export type Due = Firing & { take?: string };

type Sounds = Pick<AudioPack, 'events' | 'files'>;

const secondsOf = (pack: Sounds, key: string | undefined): number => (key ? (pack.files[key]?.seconds ?? 0) : 0);

/** The file a line or one of its takes plays from the pack. */
export const fileOf = (event: AudioEvent, take?: string): string | undefined =>
  take ? event.takes?.find((t) => t.id === take)?.key : event.source.kind === 'file' ? event.source.key : undefined;

/** How long a said line keeps the race sounding: its voice, or the ambiance it brought, whichever is longer. */
const soundsFor = (pack: Sounds, event: AudioEvent, take?: string): number => Math.max(secondsOf(pack, fileOf(event, take)), secondsOf(pack, event.under));

/** When the race last stops sounding, in run time (ms): the gun's ambiance, then every line said since. */
export const soundEndMs = (pack: Sounds, said: Said[]): number => {
  const gun = ceremonySequence(pack);
  const gunLine = gun ? gun.lines[gun.gunIndex] : undefined;
  const gunEnd = gunLine ? soundsFor(pack, gunLine) * 1000 : 0;
  return said.reduce((end, s) => {
    const event = pack.events.find((e) => e.id === s.eventId);
    return event ? Math.max(end, s.elapsedMs + soundsFor(pack, event, s.take) * 1000) : end;
  }, gunEnd);
};

/** Seconds until the next line placed on the course speaks, at the runner's pace; Infinity with no pace. */
export const secondsToNextPlaced = (state: RunState, pack: Pick<AudioPack, 'events'>, fired: ReadonlySet<string>): number => {
  const pace = state.paceSecPerKm;
  if (pace === null || !(pace > 0)) return Infinity;
  const lead = lineLeadM(pace);
  const ahead = pack.events.flatMap((e): number[] => {
    const t = e.trigger;
    switch (t.kind) {
      case 'distance':
        return fired.has(e.id) || t.meters - lead <= state.distanceM ? [] : [(t.meters - lead - state.distanceM) * (pace / 1000)];
      case 'split': {
        const next = (Math.floor(state.distanceM / t.everyMeters) + 1) * t.everyMeters;
        return next >= state.targetM ? [] : [(next - state.distanceM) * (pace / 1000)];
      }
      case 'finish':
        return [(state.targetM - state.distanceM) * (pace / 1000)];
      case 'elapsed':
        return fired.has(e.id) ? [] : [Math.max(0, t.seconds - state.elapsedMs / 1000)];
      default:
        return [];
    }
  });
  return Math.min(Infinity, ...ahead);
};

/**
 * Whether to fill now, and why. `quietS`: seconds since the race last made a sound (negative
 * while one plays); `toNextS`: until the next placed line. A silence that would outlast
 * `maxGapS` is cut in two evenly, and never later than `CLEAR_AHEAD_S` before the next line.
 */
export const fillerNeed = (r: { quietS: number; toNextS: number; moving: boolean; restart: boolean; maxGapS: number }): 'gap' | 'restart' | null => {
  if (r.restart && r.quietS >= 0) return 'restart';
  if (!r.moving || r.quietS < MIN_QUIET_S || r.toNextS <= CLEAR_AHEAD_S || r.quietS + r.toNextS <= r.maxGapS) return null;
  return r.quietS >= Math.min(r.maxGapS - CLEAR_AHEAD_S, (r.quietS + r.toNextS) / 2) ? 'gap' : null;
};

const heardOf = (said: Said[], eventId: string) => said.filter((s) => s.eventId === eventId).map((s) => s.take);

/** The filler the director plays: of the ones that can say what is needed, the least said, then the script's order. */
const fillerFor = (pack: Pick<AudioPack, 'events'>, said: Said[], reading: RunReading, need: 'gap' | 'restart'): Due | null => {
  const fillers = pack.events.filter((e) => e.trigger.kind === 'filler' && (need === 'gap' || e.takes?.some((t) => t.when === 'restart')));
  const event = fillers
    .map((e, i) => ({ e, i, n: heardOf(said, e.id).length }))
    .sort((a, b) => a.n - b.n || a.i - b.i)[0]?.e;
  if (!event) return null;
  const heard = heardOf(said, event.id);
  const take = pickTake(event, reading, heard, need === 'restart' ? 'restart' : undefined);
  return { event, key: `${event.id}#${heard.length + 1}`, ...(take ? { take } : {}) };
};

/**
 * Pure: every line due now, with the take each one says. The lines placed on the course first
 * (`nextEvents`); when none is due and the race has been quiet long enough, one filler.
 * `said`: what the run already said; `pause`: the runner's stops (`followPause`).
 */
export const dueLines = (state: RunState, pack: Pick<AudioPack, 'events' | 'files' | 'maxGapS'>, said: Said[], pause: Pause = NO_PAUSE): Due[] => {
  const fired = new Set(said.map((s) => s.key));
  const reading = readRun(state, pause);
  const placed = nextEvents(state, pack, fired).map((f) => {
    const take = pickTake(f.event, reading, heardOf(said, f.event.id));
    return take ? { ...f, take } : f;
  });
  if (placed.length > 0 || state.phase !== 'running') return placed;
  const lastSaid = said[said.length - 1]?.elapsedMs ?? 0;
  const restart = reading.restart && pause.last !== null && lastSaid < pause.last.endedMs;
  const need = fillerNeed({
    quietS: (state.elapsedMs - soundEndMs(pack, said)) / 1000,
    toNextS: secondsToNextPlaced(state, pack, fired),
    moving: !isSlow(state),
    restart,
    maxGapS: pack.maxGapS ?? MAX_GAP_S,
  });
  const filler = need ? fillerFor(pack, said, reading, need) : null;
  return filler ? [filler] : [];
};

/* ---------- a run played on paper ---------- */

/** How a simulated runner runs: an even pace, with stops and walks along the way. */
export type RunPlan = {
  paceSecPerKm: number;
  stops?: { atM: number; seconds: number }[];
  walks?: { atM: number; seconds: number; paceSecPerKm?: number }[];
};

/** One line said in a simulated run: when (from the gun), where, what, and how long it sounds. */
export type Heard = Said & { distanceM: number; file?: string; seconds: number; under?: string };

/** A walker's pace when the plan does not say: 11:00/km. */
const WALK_PACE_S = 660;

/**
 * Pure: the lines a runner holding `plan` hears, second by second, as the app would play them
 * (the same `dueLines`), on a tracker stand-in (a step every second while moving). For the
 * density check in tests and the full-run renders of `npm run produce`.
 */
export const hearRun = (pack: Pick<AudioPack, 'events' | 'files' | 'maxGapS'>, targetM: number, plan: RunPlan): Heard[] => {
  let state: RunState = { ...idleRun(targetM), phase: 'running', startedAt: 0 };
  let pause = NO_PAUSE;
  const heard: Heard[] = [];
  const stops = [...(plan.stops ?? [])].sort((a, b) => a.atM - b.atM);
  const walks = [...(plan.walks ?? [])].sort((a, b) => a.atM - b.atM);
  let stopUntil: number | null = null;
  let walkUntil: { until: number; pace: number } | null = null;
  for (let t = 1; t <= 6 * 3600 && state.phase === 'running'; t += 1) {
    if (stopUntil === null && stops[0] && state.distanceM >= stops[0].atM) stopUntil = t + stops.shift()!.seconds;
    if (walkUntil === null && walks[0] && state.distanceM >= walks[0].atM) {
      const w = walks.shift()!;
      walkUntil = { until: t + w.seconds, pace: w.paceSecPerKm ?? WALK_PACE_S };
    }
    if (stopUntil !== null && t > stopUntil) stopUntil = null;
    if (walkUntil !== null && t > walkUntil.until) walkUntil = null;
    const speed = stopUntil !== null ? 0 : 1000 / (walkUntil?.pace ?? plan.paceSecPerKm);
    const distanceM = Math.min(targetM, state.distanceM + speed);
    const elapsedMs = t * 1000;
    const km = Math.floor(distanceM / 1000);
    const splits =
      km > state.splits.length && distanceM < targetM
        ? [...state.splits, { km, elapsedMs, splitMs: elapsedMs - (state.splits[state.splits.length - 1]?.elapsedMs ?? 0) }]
        : state.splits;
    const window = speed > 0 ? [...state.window, { elapsedMs, distanceM }].filter((w) => elapsedMs - w.elapsedMs <= 30_000) : state.window;
    const first = window[0];
    const last = window[window.length - 1];
    // ms per metre is s per km.
    const paceSecPerKm = first && last && last.distanceM > first.distanceM ? (last.elapsedMs - first.elapsedMs) / (last.distanceM - first.distanceM) : state.paceSecPerKm;
    state = {
      ...state,
      phase: distanceM >= targetM ? 'finished' : 'running',
      distanceM,
      elapsedMs,
      splits,
      window,
      paceSecPerKm,
      avgPaceSecPerKm: distanceM > 0 ? elapsedMs / distanceM : null,
    };
    pause = followPause(pause, state);
    const due = dueLines(state, pack, heard, pause);
    due.forEach((d) => {
      const file = fileOf(d.event, d.take);
      heard.push({
        eventId: d.event.id,
        key: d.key,
        ...(d.take ? { take: d.take } : {}),
        elapsedMs,
        distanceM,
        ...(file ? { file } : {}),
        seconds: secondsOf(pack, file),
        ...(d.event.under ? { under: d.event.under } : {}),
      });
    });
  }
  return heard;
};
