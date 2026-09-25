import type { LatLng } from '../schemas/course';

/**
 * One `<trkpt>` or `<rtept>` as the file wrote it. A course drawn on a map has no times;
 * a treadmill or indoor recording has times and no position.
 */
export type GpxPoint = { position: LatLng | null; time: number | null };

const attr = (attrs: string, name: string): number => Number(new RegExp(`\\b${name}=["']([-\\d.]+)["']`).exec(attrs)?.[1]);

/** GPX times are UTC by the spec: a time written without a zone is read as UTC, never as the server's local time. */
const readTime = (body: string): number | null => {
  const text = /<time>\s*([^<\s]+)\s*<\/time>/.exec(body)?.[1];
  if (!text) return null;
  const ms = Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/i.test(text) ? text : `${text}Z`);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Every track or route point in document order, any number of segments. No XML library: the
 * files are simple and this runs in the Worker and in tools. The document is cut at each point
 * tag rather than matched element by element, so a truncated file costs one pass, not one per point.
 */
export const readGpxPoints = (xml: string): GpxPoint[] =>
  xml
    .split(/<(?=(?:trkpt|rtept)\b)/)
    .slice(1)
    .map((chunk) => {
      const [, attrs = '', rest = ''] = /^\w+([^>]*)>([\s\S]*)$/.exec(chunk) ?? [];
      const body = attrs.endsWith('/') ? '' : (rest.split(/<\/(?:trkpt|rtept)\s*>/)[0] ?? '');
      const lat = attr(attrs, 'lat');
      const lng = attr(attrs, 'lon');
      return { position: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null, time: readTime(body) };
    });

/** A course GPX: its name and its positions, times ignored. */
export const parseGpx = (xml: string): { name: string | null; points: LatLng[] } => {
  const nameMatch = /<name>(?:<!\[CDATA\[)?([^<\]]*)(?:\]\]>)?<\/name>/.exec(xml);
  const points = readGpxPoints(xml).flatMap((p) => (p.position ? [p.position] : []));
  return { name: nameMatch?.[1]?.trim() || null, points };
};
