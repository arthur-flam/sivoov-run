import type { LocationSample } from '../schemas/run';

const escapeXml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const isoTime = (epochMs: number): string => new Date(epochMs).toISOString();

export type GpxInput = {
  /** Shown as the track name by Strava, Garmin Connect, Google Earth... */
  name: string;
  samples: readonly LocationSample[];
  creator?: string;
};

/**
 * A recorded run as GPX 1.1: one track, one segment, one point per GPS fix with its time, and
 * its elevation when the phone gave one. The reverse of `parseGpx`, for the organizer's
 * "download the trace" button and for runners who want their run in another app.
 */
export const writeGpx = ({ name, samples, creator = 'Sivoov Run' }: GpxInput): string => {
  const first = samples[0];
  const points = samples.map(
    (s) =>
      `<trkpt lat="${s.lat.toFixed(7)}" lon="${s.lng.toFixed(7)}">` +
      (s.altitude !== undefined ? `<ele>${s.altitude.toFixed(1)}</ele>` : '') +
      `<time>${isoTime(s.timestamp)}</time></trkpt>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${escapeXml(creator)}" xmlns="http://www.topografix.com/GPX/1/1">`,
    `<metadata><name>${escapeXml(name)}</name>${first ? `<time>${isoTime(first.timestamp)}</time>` : ''}</metadata>`,
    `<trk><name>${escapeXml(name)}</name><type>running</type><trkseg>`,
    ...points,
    '</trkseg></trk>',
    '</gpx>',
    '',
  ].join('\n');
};
