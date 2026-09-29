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

/**
 * A map framed on a course: the centre and zoom Mapbox renders a static image with, so the app
 * can draw on that image (the course, the start, the places) knowing where every point lands.
 * Web Mercator in Mapbox's 512-pixel tiles; `width`/`height` are the image's logical pixels.
 */
export type MapView = { lat: number; lng: number; zoom: number; width: number; height: number };

const mercX = (lng: number): number => (lng + 180) / 360;
const mercY = (lat: number): number => {
  const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
};
const TILE = 512;

/** The tightest view that shows every point with `padding` pixels to spare, rounded as it goes in the URL. */
export const fitView = (points: readonly LatLng[], width: number, height: number, padding = 24): MapView => {
  const xs = points.map((p) => mercX(p.lng));
  const ys = points.map((p) => mercY(p.lat));
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = (px: number, merc: number) => (merc > 0 ? Math.log2(Math.max(1, px - 2 * padding) / (merc * TILE)) : 20);
  const zoom = Math.round(Math.max(0, Math.min(20, span(width, maxX - minX), span(height, maxY - minY))) * 100) / 100;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180) / Math.PI;
  const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return { lat: round6(lat), lng: round6(cx * 360 - 180), zoom, width, height };
};

/** Where a point lands on the view's image, in logical pixels from its top left corner. */
export const projectOnView = (view: MapView, p: LatLng): { x: number; y: number } => {
  const world = TILE * 2 ** view.zoom;
  return {
    x: (mercX(p.lng) - mercX(view.lng)) * world + view.width / 2,
    y: (mercY(p.lat) - mercY(view.lat)) * world + view.height / 2,
  };
};

/** The ground under a course drawn by the app: no overlays, at the view's centre and zoom, retina. */
export const baseMapUrl = (view: MapView, token: string, style = 'mapbox/streets-v12'): string =>
  `https://api.mapbox.com/styles/v1/${style}/static/${view.lng},${view.lat},${view.zoom}/${view.width}x${view.height}@2x?access_token=${encodeURIComponent(token)}`;
