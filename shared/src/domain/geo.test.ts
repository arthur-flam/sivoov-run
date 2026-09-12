import { describe, expect, it } from 'vitest';
import { bearingDeg, destination, haversineM, interpolate } from './geo';

const paris = { lat: 48.8566, lng: 2.3522 };
const deauville = { lat: 49.36, lng: 0.0752 };

describe('geo', () => {
  it('measures Paris to Deauville at about 175 km', () => {
    expect(haversineM(paris, deauville) / 1000).toBeCloseTo(175, -1);
  });
  it('destination inverts haversine and bearing', () => {
    const b = bearingDeg(paris, deauville);
    const d = haversineM(paris, deauville);
    const back = destination(paris, b, d);
    expect(haversineM(back, deauville)).toBeLessThan(50);
  });
  it('bearing north is 0, east is 90', () => {
    expect(bearingDeg(paris, { lat: 49, lng: 2.3522 })).toBeCloseTo(0, 0);
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 0);
  });
  it('interpolates midway', () => {
    expect(interpolate({ lat: 0, lng: 0 }, { lat: 2, lng: 4 }, 0.5)).toEqual({ lat: 1, lng: 2 });
  });
});
