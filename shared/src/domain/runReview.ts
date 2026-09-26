import type { LatLng } from '../schemas/course';
import type { RunDiagnostics } from '../schemas/diagnostics';
import type { Race } from '../schemas/race';
import type { LocationSample, Run, RunTrace, Split } from '../schemas/run';
import { haversineM, interpolate } from './geo';
import { windowPhase } from './raceWindow';

/**
 * What the organizer needs to review one run: does it count and why not, how each kilometre
 * went, where each kilometre was, and what the runner heard. Pure; the admin only renders it.
 */

/** Why a run does or does not count in the results. Same precedence as the admin's status badge. */
export type RunVerdict = 'counts' | 'excluded' | 'simulated' | 'rehearsal' | 'closed' | 'other_distance' | 'stopped' | 'running' | 'planned';

/** What judging a finish needs besides the run: the race window, and whether it was run on the entrant's own distance. */
export type VerdictContext = { window: Pick<Race, 'windowStart' | 'windowEnd'>; ownDistance: boolean };

/**
 * The rule of `isRanked` and of its SQL twin `rankedRun`, with the reason spelled out: a finish
 * started before the window is a rehearsal, one started after it came too late, and one on
 * another distance than the entrant's (after a re-import) never ranks. A finish with no start
 * time, which the app never sends, cannot be placed in the window and reads as a rehearsal.
 */
export const runVerdict = (run: Pick<Run, 'status' | 'source' | 'startedAt'>, excluded: boolean, { window, ownDistance }: VerdictContext): RunVerdict => {
  if (excluded) return 'excluded';
  if (run.source === 'simulation') return 'simulated';
  if (run.status === 'finished' || run.status === 'uploaded') {
    const phase = run.startedAt === undefined ? 'before' : windowPhase(window, Date.parse(run.startedAt));
    if (phase === 'before') return 'rehearsal';
    if (phase === 'after') return 'closed';
    return ownDistance ? 'counts' : 'other_distance';
  }
  if (run.status === 'running') return 'running';
  if (run.status === 'planned') return 'planned';
  return 'stopped';
};

export type SplitRow = Split & {
  /** Seconds per kilometre over this kilometre. */
  paceSecPerKm: number;
  /** Bar length in [0, 1]: the slowest kilometre is 1, a kilometre 20 % quicker than the fastest would be 0. */
  share: number;
  fastest: boolean;
  slowest: boolean;
};

/**
 * One row per kilometre, with the fastest and the slowest marked (the first one on a tie; neither
 * when every kilometre took the same time or there are fewer than three to compare). Bars start
 * at 80 % of the fastest time so a few seconds of difference stay visible.
 */
export const splitRows = (splits: readonly Split[]): SplitRow[] => {
  const times = splits.map((s) => s.splitMs);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const floor = min * 0.8;
  const varied = max > min && splits.length >= 3;
  const fastestAt = times.indexOf(min);
  const slowestAt = times.indexOf(max);
  return splits.map((s, i) => ({
    ...s,
    paceSecPerKm: s.splitMs / 1000,
    share: max > floor ? (s.splitMs - floor) / (max - floor) : 0,
    fastest: varied && i === fastestAt,
    slowest: varied && i === slowestAt,
  }));
};

export type LastStretch = { meters: number; ms: number; paceSecPerKm: number };

/** The bit after the last full kilometre (the final 97.5 m of a half), or null when there is none worth a row. */
export const lastStretch = (splits: readonly Split[], run: Pick<Run, 'elapsedMs' | 'distanceM'>): LastStretch | null => {
  const last = splits[splits.length - 1];
  const meters = run.distanceM - (last?.km ?? 0) * 1000;
  const ms = run.elapsedMs - (last?.elapsedMs ?? 0);
  return meters >= 10 && ms > 0 ? { meters, ms, paceSecPerKm: ms / meters } : null;
};

/** Binary search: index of the last sample at or before `t` (samples in time order). */
const sampleAt = (samples: readonly LocationSample[], t: number): number => {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid]!.timestamp <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

/** Where the runner stood at epoch `t`, between the two fixes around it. */
const positionAtTime = (samples: readonly LocationSample[], t: number): LatLng => {
  const i = sampleAt(samples, t);
  const a = samples[i]!;
  const b = samples[i + 1];
  if (!b || t <= a.timestamp) return { lat: a.lat, lng: a.lng };
  const span = b.timestamp - a.timestamp;
  return interpolate(a, b, span > 0 ? Math.min(1, (t - a.timestamp) / span) : 0);
};

/** Along the raw fixes, the point where the cumulative distance reaches each full kilometre. */
const marksByDistance = (samples: readonly LocationSample[]): Array<{ km: number; point: LatLng }> => {
  // A running sum: a marathon is fifteen thousand fixes, so no copying the array at each step.
  let sum = 0;
  const cumulative = samples.map((s, i) => (sum += i === 0 ? 0 : haversineM(samples[i - 1]!, s)));
  const total = cumulative[cumulative.length - 1] ?? 0;
  return Array.from({ length: Math.floor(total / 1000) }, (_, i) => i + 1).map((km) => {
    const target = km * 1000;
    const j = cumulative.findIndex((d) => d >= target);
    const before = cumulative[j - 1]!;
    const t = (target - before) / Math.max(1e-9, cumulative[j]! - before);
    return { km, point: interpolate(samples[j - 1]!, samples[j]!, t) };
  });
};

/**
 * One marker per kilometre on the runner's own trace. With splits, the marker sits where the
 * runner was when the split was taken, so the map and the split table agree; without them
 * (a file sent without splits), it falls back to the distance along the fixes.
 */
export const kmMarks = (samples: readonly LocationSample[], splits: readonly Split[], startMs: number): Array<{ km: number; point: LatLng }> => {
  if (samples.length < 2) return [];
  if (splits.length === 0) return marksByDistance(samples);
  return splits.map((s) => ({ km: s.km, point: positionAtTime(samples, startMs + s.elapsedMs) }));
};

/** "course.saint-arnoult" -> "Saint arnoult": a title for an event no announcement names. */
export const readableEventId = (id: string): string => {
  const words = (id.split('#')[0] ?? id).split('.').pop()!.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
};

export type HeardRow = {
  eventId: string;
  title: string;
  /** First time it played. */
  distanceM: number;
  elapsedMs: number;
  /** How many times it played (a split announcement plays every kilometre). */
  times: number;
  lastDistanceM: number;
};

/**
 * What the runner heard, in the order it played. An announcement that repeats (the time at
 * each kilometre) is one row with a count, not forty-two.
 */
export const heardRows = (fired: RunTrace['audioFired'], titles: ReadonlyMap<string, string>): HeardRow[] => {
  const ordered = [...fired].sort((a, b) => a.elapsedMs - b.elapsedMs);
  const ids = [...new Set(ordered.map((f) => f.eventId))];
  return ids.map((eventId) => {
    const all = ordered.filter((f) => f.eventId === eventId);
    const first = all[0]!;
    return {
      eventId,
      title: titles.get(eventId) ?? readableEventId(eventId),
      distanceM: first.distanceM,
      elapsedMs: first.elapsedMs,
      times: all.length,
      lastDistanceM: all[all.length - 1]!.distanceM,
    };
  });
};

/**
 * Fixes the phone's filter kept and threw away, when the device wrote them in its log (the app
 * logs "finished: 812 accepted, 9 rejected" at the end of a run). Null when it did not.
 */
export const fixTally = (diagnostics: RunDiagnostics | undefined): { accepted: number; rejected: number } | null => {
  const found = (diagnostics?.lines ?? [])
    .map((l) => /(\d+) accepted, (\d+) rejected/.exec(l.message))
    .filter((m): m is RegExpExecArray => m !== null)
    .pop();
  return found ? { accepted: Number(found[1]), rejected: Number(found[2]) } : null;
};
