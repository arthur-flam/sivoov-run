import { describe, expect, it } from 'vitest';
import { parseGpx } from './gpx';

describe('parseGpx', () => {
  it('reads track points and a CDATA name', () => {
    const xml = `<gpx><trk><name><![CDATA[Path]]></name><trkseg>
      <trkpt lat="49.359825000" lon="0.065857000"><ele>0</ele></trkpt>
      <trkpt lon="0.066" lat="49.36"/></trkseg></trk></gpx>`;
    expect(parseGpx(xml)).toEqual({ name: 'Path', points: [{ lat: 49.359825, lng: 0.065857 }, { lat: 49.36, lng: 0.066 }] });
  });
  it('handles routes and no name', () => {
    expect(parseGpx('<gpx><rte><rtept lat="1" lon="2"/></rte></gpx>')).toEqual({ name: null, points: [{ lat: 1, lng: 2 }] });
  });
});
