import { describe, expect, it } from 'vitest';
import { LocationSampleSchema } from '../schemas/run';
import { parseGpx } from './gpx';
import { writeGpx } from './gpxWrite';

const samples = [
  { lat: 48.8566, lng: 2.3522, altitude: 35, accuracy: 5, timestamp: Date.UTC(2026, 10, 12, 8, 0, 0) },
  { lat: 48.85671, lng: 2.35235, timestamp: Date.UTC(2026, 10, 12, 8, 0, 1) },
  { lat: 48.85683, lng: 2.35251, altitude: 36.4, timestamp: Date.UTC(2026, 10, 12, 8, 0, 2) },
].map((s) => LocationSampleSchema.parse(s));

describe('writeGpx', () => {
  it('writes one track point per GPS fix, which parseGpx reads back in order', () => {
    const xml = writeGpx({ name: 'Marc Dupont, semi-marathon', samples });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<gpx version="1.1"');
    const parsed = parseGpx(xml);
    expect(parsed.name).toBe('Marc Dupont, semi-marathon');
    expect(parsed.points).toHaveLength(3);
    parsed.points.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(samples[i]!.lat, 6);
      expect(p.lng).toBeCloseTo(samples[i]!.lng, 6);
    });
  });
  it('gives each point its time, and its elevation only when the phone knew it', () => {
    const xml = writeGpx({ name: 'Run', samples });
    expect(xml).toContain('<time>2026-11-12T08:00:00.000Z</time></trkpt>');
    expect(xml).toContain('<ele>35.0</ele>');
    expect(xml).toContain('<ele>36.4</ele>');
    expect(xml.match(/<ele>/g)).toHaveLength(2);
    // The start time also dates the file itself.
    expect(xml).toContain('<metadata><name>Run</name><time>2026-11-12T08:00:00.000Z</time></metadata>');
  });
  it('escapes the name so a runner called O’Brien & Co cannot break the file', () => {
    const xml = writeGpx({ name: 'Anne <O\'Brien> & "Co"', samples });
    expect(xml).toContain('<name>Anne &lt;O&apos;Brien&gt; &amp; &quot;Co&quot;</name>');
  });
  it('still writes a valid, empty track when there is no fix', () => {
    const xml = writeGpx({ name: 'Rien', samples: [] });
    expect(parseGpx(xml)).toEqual({ name: 'Rien', points: [] });
    expect(xml).toContain('<trkseg>\n</trkseg>');
  });
});
