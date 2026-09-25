/**
 * Wall-clock time on a race's own clock <-> ISO instants carrying their offset. A race director
 * types "9 nov. 00:00" for Deauville; the race row stores `2026-11-09T00:00:00+01:00`. Daylight
 * saving time is Intl's job: there is no timezone table here and no package.
 */

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const DAY_MS = 86_400_000;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const wallAt = (ms: number, timeZone: string): Wall => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
};

const wallAsUtc = (w: Wall): number => Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
const toSecond = (ms: number): number => Math.floor(ms / 1000) * 1000;
const pad = (n: number): string => String(n).padStart(2, '0');

/** Minutes ahead of UTC on `timeZone`'s clock at the instant `ms`: Paris is 60 in winter, 120 in summer. */
export const offsetMinutes = (ms: number, timeZone: string): number => {
  const at = toSecond(ms);
  return Math.round((wallAsUtc(wallAt(at, timeZone)) - at) / 60_000);
};

const offsetText = (minutes: number): string => {
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

/** An instant as read on the race's clock, with the offset in force: "2026-11-09T00:00:00+01:00". */
export const toZonedIso = (instant: string | number | Date, timeZone: string): string => {
  const ms = toSecond(new Date(instant).getTime());
  const w = wallAt(ms, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}${offsetText(offsetMinutes(ms, timeZone))}`;
};

/** The value for a `datetime-local` input: "2026-11-09T00:00", on the race's clock. */
export const toLocalInput = (instant: string | number | Date, timeZone: string): string => toZonedIso(instant, timeZone).slice(0, 16);

const parseLocal = (local: string): number | null => {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number) as [number, number, number, number, number, number];
  if (hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const back = new Date(ms);
  // Date.UTC rolls 30 February over into March: refuse it instead.
  return back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === day ? ms : null;
};

export type ZonedOptions = {
  /** For the end of a window typed to the minute: "23:59" means until 23:59:59. */
  endOfMinute?: boolean;
};

/**
 * "2026-11-09T00:00" typed on the race's clock -> the ISO instant with the offset in force then.
 * A time that happens twice (the night the clocks go back) is the first of the two. A time that
 * never happens (the night the clocks go forward) moves on by the jump: 02:30 becomes 03:30.
 * Null for anything that is not a real date and time, or a timezone Intl does not know.
 */
export const zonedLocalToIso = (local: string, timeZone: string, options: ZonedOptions = {}): string | null => {
  const parsed = parseLocal(local);
  if (parsed === null) return null;
  const wall = options.endOfMinute && !/:\d{2}:\d{2}$/.test(local.trim()) ? parsed + 59_000 : parsed;
  try {
    // Offsets in force around that wall time: one on an ordinary day, two across a change.
    const candidates = [...new Set([-DAY_MS, 0, DAY_MS].map((d) => offsetMinutes(wall + d, timeZone)))];
    const instants = candidates.map((o) => wall - o * 60_000).filter((t) => wall - offsetMinutes(t, timeZone) * 60_000 === t);
    const chosen = instants.length > 0 ? Math.min(...instants) : wall - offsetMinutes(wall - DAY_MS, timeZone) * 60_000;
    return toZonedIso(chosen, timeZone);
  } catch {
    return null;
  }
};

/** "2026-11-14" -> "2026-11-09": the Monday of that date's week. */
const mondayOf = (isoDate: string): string => {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  const back = (new Date(ms).getUTCDay() + 6) % 7;
  return new Date(ms - back * DAY_MS).toISOString().slice(0, 10);
};

/**
 * The default virtual window of a race: the Monday to the Sunday of the week of its first day,
 * from 00:00 to 23:59 on the race's clock. Deauville (Saturday 14 November 2026) gets
 * 9 November 00:00 to 15 November 23:59:59.
 */
export const raceWeekWindow = (dateStart: string, timeZone: string): { windowStart: string; windowEnd: string } | null => {
  if (Number.isNaN(Date.parse(`${dateStart}T00:00:00Z`))) return null;
  const monday = mondayOf(dateStart);
  const sunday = new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * DAY_MS).toISOString().slice(0, 10);
  const windowStart = zonedLocalToIso(`${monday}T00:00`, timeZone);
  const windowEnd = zonedLocalToIso(`${sunday}T23:59`, timeZone, { endOfMinute: true });
  return windowStart && windowEnd ? { windowStart, windowEnd } : null;
};
