import { describe, expect, it } from 'vitest';
import { encodePolyline, staticMapUrl, thinPoints } from './mapbox';

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
