import type { LatLng, Landmark } from '../schemas/course';
import type { LocationSample } from '../schemas/run';
import { positionAtDistance, trackMetersForRun } from './course';
import type { Bounds, CourseTrack } from './course';
import { bearingDeg, haversineM } from './geo';

/**
 * What the run screen draws, computed from the course and the run: the same on a phone and in
 * a browser, so the map follows the runner identically on both. No drawing here.
 */

export type FollowCamera = {
  /** Where the runner stands on the course, on the map. */
  center: LatLng;
  /** Which way the course goes from here, degrees from north. */
  bearing: number;
  /** How far along the drawn course line the runner is, 0 to 1: the run and the rest split there. */
  fraction: number;
};

export type FollowOptions = { behindM?: number; aheadM?: number };

/**
 * The camera behind the runner, looking down the course. The heading is taken over a short
 * stretch of course (a little behind to a little ahead, about fifteen seconds of running)
 * rather than the segment underfoot, so the zigzag of a GPX never shakes the view, while a real
 * turn swings it round as the runner reaches it, not half a minute before.
 */
export const followCamera = (track: CourseTrack, officialM: number, runM: number, { behindM = 10, aheadM = 40 }: FollowOptions = {}): FollowCamera => {
  const trackM = trackMetersForRun(track, officialM, runM);
  const here = positionAtDistance(track, trackM);
  const from = positionAtDistance(track, trackM - behindM).point;
  const to = positionAtDistance(track, trackM + aheadM).point;
  return {
    center: here.point,
    bearing: haversineM(from, to) > 1 ? bearingDeg(from, to) : here.bearing,
    fraction: track.totalM > 0 ? trackM / track.totalM : 0,
  };
};

/** The fraction of the course line the runner has covered, for the line's run and rest colours. */
export const courseFraction = (track: CourseTrack, officialM: number, runM: number): number =>
  track.totalM > 0 ? trackMetersForRun(track, officialM, runM) / track.totalM : 0;

export type Glide = {
  /** The distance of the latest fix, official meters. */
  fixM: number;
  /** The runner's current speed, m/s (0 when unknown). */
  speedMps: number;
  /** Time since that fix. */
  sinceFixMs: number;
  /** What the map showed last frame. */
  shownM: number;
  /** The course's official distance: the map never goes past the finish. */
  targetM: number;
};

/**
 * The distance the map shows between two GPS fixes. Fixes arrive once a second; drawn as they
 * come, the camera would lurch forward three meters at a time. Between fixes it carries on at
 * the runner's pace for at most `maxAheadMs`, and it never goes backwards: a slower runner is
 * caught up by waiting, not by reversing. The numbers on screen stay the tracker's own.
 */
export const glideDistance = ({ fixM, speedMps, sinceFixMs, shownM, targetM }: Glide, maxAheadMs = 1500): number =>
  Math.min(targetM, Math.max(shownM, fixM + (Math.max(0, speedMps) * Math.min(Math.max(0, sinceFixMs), maxAheadMs)) / 1000));

/** Meters per second from a pace in seconds per kilometre; 0 when there is no pace yet. */
export const speedFromPace = (secPerKm: number | null): number => (secPerKm && secPerKm > 0 && Number.isFinite(secPerKm) ? 1000 / secPerKm : 0);

/**
 * The GPS as the runner should hear about it: 'searching' before the first fix, 'lost' when
 * none came for `lostMs` (a phone standing still at a crossing may pause its fixes: long enough
 * not to cry wolf), 'weak' when the last one is vaguer than `weakM`, 'good' otherwise.
 */
export type GpsSignal = 'searching' | 'good' | 'weak' | 'lost';

export const gpsSignal = (lastFix: Pick<LocationSample, 'timestamp' | 'accuracy'> | null, now: number, { weakM = 25, lostMs = 20_000 } = {}): GpsSignal => {
  if (!lastFix) return 'searching';
  if (now - lastFix.timestamp > lostMs) return 'lost';
  return (lastFix.accuracy ?? 0) > weakM ? 'weak' : 'good';
};

export type Ahead = { kind: 'landmark'; name: string; inM: number } | { kind: 'finish'; inM: number };

/** What comes next on the course and how far: the next place strictly ahead, else the finish line. */
export const aheadOf = (landmarks: Landmark[], officialM: number, runM: number): Ahead => {
  const next = [...landmarks].sort((a, b) => a.meters - b.meters).find((l) => l.meters > runM && l.meters < officialM);
  return next ? { kind: 'landmark', name: next.name, inM: next.meters - runM } : { kind: 'finish', inM: Math.max(0, officialM - runM) };
};

/** The course's box grown by `marginM` on every side: what the overview frames, and what is kept for offline. */
export const paddedBounds = (bounds: Bounds, marginM: number): Bounds => {
  const dLat = marginM / 111_320;
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const dLng = marginM / (111_320 * Math.max(0.01, Math.cos((midLat * Math.PI) / 180)));
  return { minLat: bounds.minLat - dLat, maxLat: bounds.maxLat + dLat, minLng: bounds.minLng - dLng, maxLng: bounds.maxLng + dLng };
};

export type LightPreset = 'dawn' | 'day' | 'dusk' | 'night';

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The sun's height above the horizon at a place and instant, degrees. Declination and hour
 * angle only (no equation of time): a few degrees off at most, enough to light a map.
 */
export const sunElevation = (at: LatLng, date: Date): number => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  const declination = toRad(-23.44) * Math.cos(toRad((360 / 365) * (day + 10)));
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const hourAngle = toRad(15 * (utcHours + at.lng / 15 - 12));
  const lat = toRad(at.lat);
  const sin = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  return (Math.asin(Math.max(-1, Math.min(1, sin))) * 180) / Math.PI;
};

/**
 * The map's light, from the sun over the course right now: the runner at dusk sees the course
 * at dusk. Morning twilight is dawn, evening twilight is dusk.
 */
export const lightPresetAt = (at: LatLng, date: Date): LightPreset => {
  const elevation = sunElevation(at, date);
  if (elevation > 6) return 'day';
  if (elevation < -6) return 'night';
  const solarHours = (date.getUTCHours() + date.getUTCMinutes() / 60 + at.lng / 15 + 24) % 24;
  return solarHours < 12 ? 'dawn' : 'dusk';
};
