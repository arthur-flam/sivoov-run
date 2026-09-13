import { describe, expect, it } from 'vitest';
import { deauvilleMarathonGeometry, deauvilleMarathonLandmarks } from '../fixtures';
import { buildTrack, decimate, nearestOnTrack, nextLandmark, positionAtDistance, positionForRun, runMetersForTrack, toDiagram, trackMetersForRun } from './course';
import { haversineM } from './geo';

const track = buildTrack(deauvilleMarathonGeometry.points);

describe('course track', () => {
  it('measures the Deauville GPX at about 42.4 km', () => {
    expect(track.totalM / 1000).toBeCloseTo(42.4, 0);
    expect(track.cumulative).toHaveLength(track.points.length);
    expect(track.cumulative[0]).toBe(0);
  });
  it('starts and ends on the Planches', () => {
    expect(positionAtDistance(track, 0).point).toEqual(track.points[0]);
    expect(positionAtDistance(track, 1e9).point).toEqual(track.points[track.points.length - 1]);
  });
  it('walks the polyline: 1000 m along is 1000 m along', () => {
    const p = positionAtDistance(track, 1000);
    const back = positionAtDistance(track, 990);
    expect(haversineM(back.point, p.point)).toBeCloseTo(10, 0);
    expect(p.segmentIndex).toBeGreaterThanOrEqual(back.segmentIndex);
  });
  it('maps the official distance onto the finish line', () => {
    expect(trackMetersForRun(track, 42195, 42195)).toBe(track.totalM);
    expect(trackMetersForRun(track, 42195, 0)).toBe(0);
    expect(positionForRun(track, 42195, 21097.5).trackM).toBeCloseTo(track.totalM / 2, 3);
  });
  it('rejects a single point', () => {
    expect(() => buildTrack([{ lat: 0, lng: 0 }])).toThrow();
  });
});

describe('landmarks', () => {
  it('finds the next one ahead', () => {
    expect(nextLandmark(deauvilleMarathonLandmarks, 0)?.id).toBe('planches');
    expect(nextLandmark(deauvilleMarathonLandmarks, 200)?.id).toBe('normandy');
    expect(nextLandmark(deauvilleMarathonLandmarks, 42195)).toBeUndefined();
  });
});

describe('diagram', () => {
  it('fits the track into the box with padding', () => {
    const { points } = toDiagram(track, 300, 200, 10);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...xs)).toBeLessThanOrEqual(290);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(190);
    // The course is taller than wide: height is the limiting dimension
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(180, 0);
  });
  it('keeps first and last when decimating', () => {
    const d = decimate(track.points, 10);
    expect(d[0]).toEqual(track.points[0]);
    expect(d[d.length - 1]).toEqual(track.points[track.points.length - 1]);
    expect(d.length).toBeLessThan(track.points.length / 9);
  });
});

describe('nearestOnTrack', () => {
  it('projects a point on the line back to its own distance along the track', () => {
    const at = positionAtDistance(track, 12_000);
    const found = nearestOnTrack(track, at.point);
    expect(found.trackM).toBeCloseTo(12_000, 0);
    expect(found.offsetM).toBeLessThan(1);
  });
  it('projects a point beside the line and reports how far off it was', () => {
    // A straight 1 km segment: a real course loops back on itself, and a click between two
    // branches legitimately snaps to whichever is nearer (the studio shows the distance it
    // found before adding anything).
    const straight = buildTrack([
      { lat: 49.36, lng: 0.06 },
      { lat: 49.36, lng: 0.0737 },
    ]);
    const half = positionAtDistance(straight, straight.totalM / 2);
    const found = nearestOnTrack(straight, { lat: half.point.lat + 0.0009, lng: half.point.lng });
    expect(Math.abs(found.trackM - straight.totalM / 2)).toBeLessThan(5);
    expect(found.offsetM).toBeGreaterThan(80);
    expect(found.offsetM).toBeLessThan(120);
    expect(found.point.lat).toBeCloseTo(half.point.lat, 6);
  });
  it('inverts the run/track proportion, so a click becomes an official distance', () => {
    const trackM = trackMetersForRun(track, 42_195, 21_097.5);
    expect(runMetersForTrack(track, 42_195, trackM)).toBeCloseTo(21_097.5, 3);
    expect(runMetersForTrack(track, 42_195, track.totalM)).toBe(42_195);
  });
});
