/**
 * The weather now, in a few French words, for an AI personal line. Open-Meteo: no key, no account. Positions are rounded to
 * about a kilometre before they leave the Worker, and nothing is stored. Any failure is null,
 * and the line is written without the weather.
 */
import { frenchNumber } from '@sivoov/shared';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

/** WMO weather codes, as a speaker would say them. */
const SKY: [number, string][] = [
  [0, 'ciel dégagé'],
  [3, 'nuageux'],
  [48, 'brouillard'],
  [57, 'bruine'],
  [67, 'pluie'],
  [77, 'neige'],
  [82, 'averses'],
  [86, 'averses de neige'],
  [99, 'orage'],
];

export const skyFor = (code: number): string => (code === 1 || code === 2 ? 'quelques nuages' : (SKY.find(([max]) => code <= max)?.[1] ?? 'temps variable'));

const round = (n: number) => Math.round(n * 100) / 100;

const degrees = (t: number): string => {
  const n = Math.round(t);
  return `${n < 0 ? 'moins ' : ''}${frenchNumber(Math.abs(n))} degré${Math.abs(n) > 1 ? 's' : ''}`;
};

/** In words, like everything the voice reads: "neuf degrés, vent de vingt kilomètres heure, pluie". */
export const weatherWords = (current: { temperature_2m: number; wind_speed_10m: number; weather_code: number }): string =>
  `${degrees(current.temperature_2m)}, vent de ${frenchNumber(Math.round(current.wind_speed_10m))} kilomètres heure, ${skyFor(current.weather_code)}`;

export const weatherAt = async (point: { lat: number; lng: number }, fetchImpl: typeof fetch = fetch): Promise<string | null> => {
  const url = `${OPEN_METEO}?latitude=${round(point.lat)}&longitude=${round(point.lng)}&current=temperature_2m,wind_speed_10m,weather_code&wind_speed_unit=kmh`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const body = (await res.json()) as { current?: { temperature_2m?: number; wind_speed_10m?: number; weather_code?: number } };
    const c = body.current;
    if (!c || typeof c.temperature_2m !== 'number' || typeof c.wind_speed_10m !== 'number' || typeof c.weather_code !== 'number') return null;
    return weatherWords({ temperature_2m: c.temperature_2m, wind_speed_10m: c.wind_speed_10m, weather_code: c.weather_code });
  } catch {
    return null;
  }
};
