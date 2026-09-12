import { describe, expect, it } from 'vitest';
import { deauvilleMarathonGeometry, deauvilleMarathonLandmarks } from '../fixtures';
import { buildTrack, decimate, nextLandmark, positionAtDistance, positionForRun, toDiagram, trackMetersForRun } from './course';
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
