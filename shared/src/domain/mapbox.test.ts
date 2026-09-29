import { describe, expect, it } from 'vitest';
import { baseMapUrl, encodePolyline, fitView, projectOnView, staticMapUrl, thinPoints } from './mapbox';

describe('encoded polyline', () => {
  it('matches the reference example from the algorithm spec', () => {
    const points = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });
});

describe('thinning', () => {
  it('keeps the ends and at most max points', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => i);
    const thin = thinPoints(pts, 50);
    expect(thin).toHaveLength(50);
    expect(thin[0]).toBe(0);
    expect(thin[49]).toBe(999);
    expect(thinPoints([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });
});

describe('static map url', () => {
  it('builds a retina auto-fitted map with the course path and start/finish pins', () => {
    const url = staticMapUrl({ points: [{ lat: 49.36, lng: 0.07 }, { lat: 49.3, lng: 0.1 }], token: 'pk.test', width: 600, height: 300 });
    expect(url.startsWith('https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/path-4+e63946-0.9(')).toBe(true);
    expect(url).toContain('pin-s-a+1d3557(0.07,49.36)');
    expect(url).toContain('/auto/600x300@2x?');
    expect(url).toContain('access_token=pk.test');
  });
});

describe('a map framed on a course', () => {
  const course = [
    { lat: 49.3598, lng: 0.0658 },
    { lat: 49.3117, lng: 0.0847 },
    { lat: 49.3395, lng: 0.0508 },
  ];

  it('keeps every point inside the image, with the padding to spare on the tight side', () => {
    const view = fitView(course, 360, 300, 24);
    const projected = course.map((p) => projectOnView(view, p));
    projected.forEach(({ x, y }) => {
      expect(x).toBeGreaterThanOrEqual(23);
      expect(x).toBeLessThanOrEqual(337);
      expect(y).toBeGreaterThanOrEqual(23);
      expect(y).toBeLessThanOrEqual(277);
    });
    // This course is taller than wide: it fills the height, north at the top.
    const ys = projected.map((p) => p.y);
    expect(Math.min(...ys)).toBeLessThan(26);
    expect(Math.max(...ys)).toBeGreaterThan(274);
    expect(projected[0]!.y).toBeLessThan(projected[1]!.y);
  });

  it('puts the centre of the view in the middle of the image', () => {
    const view = fitView(course, 400, 300);
    const { x, y } = projectOnView(view, { lat: view.lat, lng: view.lng });
    expect(x).toBeCloseTo(200, 6);
    expect(y).toBeCloseTo(150, 6);
  });

  it('asks Mapbox for exactly that view, with nothing drawn on it', () => {
    const view = fitView(course, 360, 300);
    expect(baseMapUrl(view, 'pk.test')).toBe(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${view.lng},${view.lat},${view.zoom}/360x300@2x?access_token=pk.test`);
  });
});
