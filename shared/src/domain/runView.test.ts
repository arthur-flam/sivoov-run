import { describe, expect, it } from 'vitest';
import { LandmarkSchema } from '../schemas/course';
import { buildTrack } from './course';
import { destination } from './geo';
import { aheadOf, courseFraction, followCamera, glideDistance, gpsSignal, lightPresetAt, paddedBounds, speedFromPace, sunElevation } from './runView';

const start = { lat: 49.36, lng: 0.07 };
/** 1 km due east, then 1 km due north: one clean right-angle turn at 1 000 m. */
const corner = destination(start, 90, 1000);
const track = buildTrack([start, destination(start, 90, 500), corner, destination(corner, 0, 500), destination(corner, 0, 1000)]);
const officialM = 2000;

describe('the camera behind the runner', () => {
  it('looks down the course: east on the first leg, north on the second', () => {
    expect(followCamera(track, officialM, 400).bearing).toBeCloseTo(90, 0);
    expect(followCamera(track, officialM, 1600).bearing).toBeCloseTo(0, 0);
  });

  it('swings round a turn as the runner reaches it, instead of snapping at the corner', () => {
    expect(followCamera(track, officialM, 940).bearing).toBeCloseTo(90, 0);
    const before = followCamera(track, officialM, 990).bearing;
    const after = followCamera(track, officialM, 1005).bearing;
    expect(before).toBeGreaterThan(5);
    expect(before).toBeLessThan(85);
    expect(after).toBeGreaterThan(5);
    expect(after).toBeLessThan(85);
  });

  it('stands where the runner is and says how much of the line is run', () => {
    const cam = followCamera(track, officialM, 1000);
    expect(cam.center.lat).toBeCloseTo(corner.lat, 5);
    expect(cam.center.lng).toBeCloseTo(corner.lng, 5);
    expect(cam.fraction).toBeCloseTo(0.5, 2);
    expect(courseFraction(track, officialM, 3000)).toBe(1);
  });

  it('holds a heading at the start and at the finish, where the course runs out behind or ahead', () => {
    expect(followCamera(track, officialM, 0).bearing).toBeCloseTo(90, 0);
    expect(followCamera(track, officialM, officialM).bearing).toBeCloseTo(0, 0);
  });
});

describe('the map between two fixes', () => {
  const glide = { fixM: 1000, speedMps: 3, sinceFixMs: 500, shownM: 0, targetM: 42195 };

  it('carries on at the runner’s pace after the last fix', () => {
    expect(glideDistance(glide)).toBeCloseTo(1001.5, 5);
  });

  it('never runs ahead of the last fix by more than a second and a half of running', () => {
    expect(glideDistance({ ...glide, sinceFixMs: 60_000 })).toBeCloseTo(1004.5, 5);
  });

  it('never goes backwards when a fix says the runner slowed', () => {
    expect(glideDistance({ ...glide, fixM: 999, sinceFixMs: 0, shownM: 1003 })).toBe(1003);
  });

  it('stops at the finish line', () => {
    expect(glideDistance({ ...glide, fixM: 42194, targetM: 42195 })).toBe(42195);
  });

  it('reads a speed from a pace, none from no pace', () => {
    expect(speedFromPace(300)).toBeCloseTo(3.333, 3);
    expect(speedFromPace(null)).toBe(0);
  });
});

describe('the GPS as the runner hears about it', () => {
  it('searches before the first fix, then is good, weak or lost', () => {
    expect(gpsSignal(null, 0)).toBe('searching');
    expect(gpsSignal({ timestamp: 1000, accuracy: 4 }, 2000)).toBe('good');
    expect(gpsSignal({ timestamp: 1000, accuracy: 40 }, 2000)).toBe('weak');
    expect(gpsSignal({ timestamp: 1000, accuracy: 4 }, 1000 + 21_000)).toBe('lost');
  });

  it('does not call a runner waiting at a crossing lost', () => {
    expect(gpsSignal({ timestamp: 1000, accuracy: 4 }, 1000 + 12_000)).toBe('good');
  });
});

describe('what comes next on the course', () => {
  const landmarks = [
    LandmarkSchema.parse({ id: 'planches', name: 'Les Planches', meters: 1500 }),
    LandmarkSchema.parse({ id: 'port', name: 'Le port', meters: 800 }),
    LandmarkSchema.parse({ id: 'arrivee', name: 'Arrivée', meters: 2000 }),
  ];

  it('names the next place and how far it is', () => {
    expect(aheadOf(landmarks, officialM, 500)).toEqual({ kind: 'landmark', name: 'Le port', inM: 300 });
    expect(aheadOf(landmarks, officialM, 800)).toEqual({ kind: 'landmark', name: 'Les Planches', inM: 700 });
  });

  it('points at the finish once the places are behind, a landmark on the line included', () => {
    expect(aheadOf(landmarks, officialM, 1600)).toEqual({ kind: 'finish', inM: 400 });
  });
});

describe('the course’s box', () => {
  it('grows by the margin on every side', () => {
    const box = paddedBounds(track.bounds, 500);
    expect((track.bounds.minLat - box.minLat) * 111_320).toBeCloseTo(500, 0);
    expect(box.maxLng).toBeGreaterThan(track.bounds.maxLng);
  });
});

describe('the map’s light', () => {
  const deauville = { lat: 49.36, lng: 0.07 };

  it('puts the sun high at noon in June and under the horizon at midnight', () => {
    expect(sunElevation(deauville, new Date('2026-06-21T12:00:00Z'))).toBeGreaterThan(60);
    expect(sunElevation(deauville, new Date('2026-06-21T23:30:00Z'))).toBeLessThan(-10);
  });

  it('lights a November race week the way the runner sees it: dark by six, day at noon', () => {
    expect(lightPresetAt(deauville, new Date('2026-11-14T11:00:00Z'))).toBe('day');
    expect(lightPresetAt(deauville, new Date('2026-11-14T16:50:00Z'))).toBe('dusk');
    expect(lightPresetAt(deauville, new Date('2026-11-14T19:00:00Z'))).toBe('night');
    expect(lightPresetAt(deauville, new Date('2026-11-14T07:05:00Z'))).toBe('dawn');
  });
});
