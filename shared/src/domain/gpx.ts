import type { LatLng } from '../schemas/course';

/**
 * Minimal GPX reader: track points in document order, any number of segments.
 * No XML library: the files we get are simple and this runs in the Worker and in tools.
 */
export const parseGpx = (xml: string): { name: string | null; points: LatLng[] } => {
  const nameMatch = /<name>(?:<!\[CDATA\[)?([^<\]]*)(?:\]\]>)?<\/name>/.exec(xml);
  const attr = (attrs: string, name: string): number => Number(new RegExp(`\\b${name}="([-\\d.]+)"`).exec(attrs)?.[1]);
  const points = [...xml.matchAll(/<(?:trkpt|rtept)\b([^>]*)>/g)]
    .map((m) => ({ lat: attr(m[1] ?? '', 'lat'), lng: attr(m[1] ?? '', 'lon') }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return { name: nameMatch?.[1]?.trim() || null, points };
};
