import type { LatLng } from '../schemas/course';

/** Google/Mapbox encoded polyline (precision 5), the compact form the Static Images API accepts. */
export const encodePolyline = (points: readonly LatLng[]): string => {
  const encodeValue = (value: number): string => {
    const v = value < 0 ? ~(value << 1) : value << 1;
    const chunks: string[] = [];
    let rest = v;
    while (rest >= 0x20) {
      chunks.push(String.fromCharCode((0x20 | (rest & 0x1f)) + 63));
      rest >>= 5;
    }
    chunks.push(String.fromCharCode(rest + 63));
    return chunks.join('');
  };
  const rounded = points.map((p) => ({ lat: Math.round(p.lat * 1e5), lng: Math.round(p.lng * 1e5) }));
  return rounded.map((p, i) => encodeValue(p.lat - (rounded[i - 1]?.lat ?? 0)) + encodeValue(p.lng - (rounded[i - 1]?.lng ?? 0))).join('');
};

/** Keep at most `max` points, evenly spaced, always the first and the last. URLs have a length limit. */
export const thinPoints = <T>(points: readonly T[], max: number): T[] => {
  if (points.length <= max || max < 2) return [...points];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
};

export type StaticMapOptions = {
  points: readonly LatLng[];
  token: string;
  width?: number;
  height?: number;
  /** Hex without '#'. */
  color?: string;
  style?: string;
  maxPoints?: number;
};

/** Mapbox Static Images URL: the course as a path, auto-fitted, retina. Start and finish as pins. */
export const staticMapUrl = ({ points, token, width = 720, height = 400, color = 'e63946', style = 'mapbox/outdoors-v12', maxPoints = 300 }: StaticMapOptions): string => {
  const thin = thinPoints(points, maxPoints);
  const path = `path-4+${color}-0.9(${encodeURIComponent(encodePolyline(thin))})`;
  const start = thin[0]!;
  const finish = thin[thin.length - 1]!;
  const pins = `pin-s-a+1d3557(${start.lng},${start.lat}),pin-s-b+${color}(${finish.lng},${finish.lat})`;
  return `https://api.mapbox.com/styles/v1/${style}/static/${path},${pins}/auto/${width}x${height}@2x?padding=40&access_token=${encodeURIComponent(token)}`;
};
