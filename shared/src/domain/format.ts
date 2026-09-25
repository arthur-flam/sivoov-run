import type { Locale } from '../i18n/index';

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

/** Parses "5:30" into seconds per km. Used by the ?pace= dev parameter. */
export const parsePace = (text: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** "1er", "12e" in French; "1st", "12th" in English. A results table, not a sentence. */
export const formatRank = (rank: number, locale: Locale): string => {
  if (locale === 'fr') return rank === 1 ? '1er' : `${rank}e`;
  const teen = rank % 100 >= 11 && rank % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[rank % 10] ?? 'th';
  return `${rank}${suffix}`;
};
