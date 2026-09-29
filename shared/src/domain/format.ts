import { distanceLabel } from '../i18n/index';
import type { Locale } from '../i18n/index';
import type { DistanceKey } from '../schemas/race';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** h:mm:ss above an hour, m:ss below. Race clocks never show tenths. */
export const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
};

/** Certificate style: always h:mm:ss. */
export const formatOfficialTime = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 3600)}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
};

/** "5:30" for 330 s/km; "--:--" when unknown. */
export const formatPace = (secPerKm: number | null): string => {
  if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const rounded = Math.round(secPerKm);
  return `${Math.floor(rounded / 60)}:${pad2(rounded % 60)}`;
};

/** "10,00 km" in French, "10.00 km" in English. */
export const formatKm = (meters: number, locale: Locale, digits = 2): string => {
  const km = (meters / 1000).toFixed(digits);
  return `${locale === 'fr' ? km.replace('.', ',') : km} km`;
};

/** Official distances are written the way runners know them: 42,195 km, 21,1 km, 10 km. */
const OFFICIAL_DIGITS: Record<DistanceKey, number> = { marathon: 3, half: 1, '10k': 0, '5k': 0 };

/** A course's official distance: "42,195 km", "21,1 km", "10 km". */
export const formatOfficialKm = (meters: number, key: DistanceKey, locale: Locale): string => formatKm(meters, locale, OFFICIAL_DIGITS[key]);

/** "Semi-marathon · 21,1 km", but "10 km" alone where the name already is the distance. */
export const formatDistanceLine = (meters: number, key: DistanceKey, locale: Locale): string => {
  const name = distanceLabel(locale, key);
  const km = formatOfficialKm(meters, key, locale);
  return name === km ? name : `${name} · ${km}`;
};

/** A place along the course: "3,9 km", "30 km". */
export const formatPlaceKm = (meters: number, locale: Locale): string => formatKm(meters, locale, 1).replace(/[.,]0 km$/, ' km');

/**
 * How far away something is, the way a runner reads it: "350 m" under a kilometre (to the
 * nearest 10 m), "1,2 km" above it.
 */
export const formatDistanceAway = (meters: number, locale: Locale): string => {
  const m = Math.max(0, meters);
  if (m < 995) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return formatKm(m, locale, 1);
};

/** "1,9 Mo" in French, "1.9 MB" in English: a download size, never under 0.1. */
export const formatMegabytes = (bytes: number, locale: Locale): string => {
  const mb = Math.max(0.1, bytes / 1_000_000).toFixed(1);
  return locale === 'fr' ? `${mb.replace('.', ',')} Mo` : `${mb} MB`;
};

/** Parses "5:30" into seconds per km. Used by the ?pace= dev parameter. */
export const parsePace = (text: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

