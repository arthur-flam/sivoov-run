import { describe, expect, it } from 'vitest';
import { parseGpx, readGpxPoints } from './gpx';

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

describe('readGpxPoints, for a recorded run', () => {
  it('reads the time of each point, not the time of the file', () => {
    const xml = `<gpx><metadata><time>2026-11-10T07:00:00Z</time></metadata><trk><trkseg>
      <trkpt lat="49.36" lon="0.07"><ele>4</ele><time>2026-11-10T08:00:00Z</time></trkpt>
      <trkpt lat="49.361" lon="0.07"><time>2026-11-10T08:00:03.500Z</time><extensions><hr>140</hr></extensions></trkpt>
    </trkseg></trk></gpx>`;
    expect(readGpxPoints(xml)).toEqual([
      { position: { lat: 49.36, lng: 0.07 }, time: Date.parse('2026-11-10T08:00:00Z') },
      { position: { lat: 49.361, lng: 0.07 }, time: Date.parse('2026-11-10T08:00:03.500Z') },
    ]);
  });
  it('honours a zone offset, and reads a time written without one as UTC', () => {
    const xml = `<trkpt lat="1" lon="2"><time>2026-11-10T09:00:00+01:00</time></trkpt><trkpt lat='1' lon='2'><time>2026-11-10T08:00:05</time></trkpt>`;
    expect(readGpxPoints(xml).map((p) => p.time)).toEqual([Date.parse('2026-11-10T08:00:00Z'), Date.parse('2026-11-10T08:00:05Z')]);
  });
  it('keeps a treadmill point that has a time and no position, and a drawn point with no time', () => {
    const xml = `<trkpt><time>2026-11-10T08:00:00Z</time></trkpt><rtept lat="1" lon="2"/><trkpt lat="1" lon="2"><time>not a date</time></trkpt>`;
    expect(readGpxPoints(xml)).toEqual([
      { position: null, time: Date.parse('2026-11-10T08:00:00Z') },
      { position: { lat: 1, lng: 2 }, time: null },
      { position: { lat: 1, lng: 2 }, time: null },
    ]);
  });
  it('reads a file cut off mid-point up to where it stops', () => {
    const xml = `<gpx><trk><trkseg><trkpt lat="1" lon="2"><time>2026-11-10T08:00:00Z</time></trkpt><trkpt lat="1.001" lon="2"><time>2026-11-10T08:00`;
    expect(readGpxPoints(xml)).toEqual([
      { position: { lat: 1, lng: 2 }, time: Date.parse('2026-11-10T08:00:00Z') },
      { position: { lat: 1.001, lng: 2 }, time: null },
    ]);
  });
  it('finds nothing in a file that is not a GPX', () => {
    expect(readGpxPoints('<TrainingCenterDatabase><Trackpoint><Time>2026-11-10T08:00:00Z</Time></Trackpoint></TrainingCenterDatabase>')).toEqual([]);
  });
});
