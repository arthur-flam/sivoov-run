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
  /** The tracker's distance, official meters. It moves in steps: a few fixes' worth at a time. */
  fixM: number;
  /** The runner's speed on the screen's clock, m/s: a simulation's is its own times its rate (0 when unknown). */
  speedMps: number;
  /** What the map showed last frame. */
  shownM: number;
  /** Time since that frame. */
  dtMs: number;
  /** The course's official distance: the map never goes past the finish. */
  targetM: number;
};

export type GlideOptions = {
  /** How quickly the map closes the distance to the tracker, beyond the runner's pace: a time constant, seconds. */
  catchS?: number;
  /** How far past the tracker the map may run on at the runner's pace, seconds of running (the tracker lags by a step). */
  leadS?: number;
  /** Past this far behind (a run coming back, a phone out of a pocket), the map goes straight there. */
  snapM?: number;
};

/**
 * The distance the map shows, frame to frame. The tracker's distance moves in steps (it waits
 * for a few fixes' worth of ground before it counts it, 13 m at a time on a steady run): drawn
 * as they come, the camera would lurch forward every few seconds, every second in a simulation.
 * The map carries on at the runner's pace and closes the gap to the tracker gently, never
 * backwards, never far ahead of it. The numbers on screen stay the tracker's own.
 */
export const glideStep = ({ fixM, speedMps, shownM, dtMs, targetM }: Glide, { catchS = 2, leadS = 5, snapM = 100 }: GlideOptions = {}): number => {
  if (fixM - shownM > snapM) return Math.min(targetM, fixM);
  const dt = Math.min(Math.max(0, dtMs), 1000) / 1000;
  const speed = Math.max(0, speedMps);
  const next = Math.min(shownM + dt * (speed + (fixM - shownM) / catchS), fixM + speed * leadS);
  return Math.min(targetM, Math.max(shownM, next));
};

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
