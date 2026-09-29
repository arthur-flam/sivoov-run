import type { Run, Split } from '../schemas/run';

/**
 * The race report a finisher shares: their time at each timing point of the course, the pace
 * between two points, their place in the field at each one (from the other finishers' own
 * kilometre splits), the two halves, and how many places they made up. Pure: the share cards
 * and the result page only draw it.
 */

/** Every how many kilometres a timing point stands: 5 km on a marathon or a half, 2 on a 10 km, 1 below. */
export const checkpointStep = (officialM: number): number => (officialM >= 20000 ? 5 : officialM >= 8000 ? 2 : 1);

/** A point this close to the finish is left out: the finish row says it. */
const FINISH_GAP_M = 300;

/** The timing points, in metres, the finish included. */
export const checkpointMeters = (officialM: number): number[] => {
  const step = checkpointStep(officialM) * 1000;
  const between = Array.from({ length: Math.floor(officialM / step) }, (_, i) => (i + 1) * step).filter((m) => m < officialM - FINISH_GAP_M);
  return [...between, officialM];
};

type Timed = Pick<Run, 'elapsedMs' | 'splits'>;

/**
 * The clock when the runner passed `meters`: the kilometre split when there is one, else read
 * between the two known points around it (the start, the kilometres, the finish at the official
 * distance). Null when the splits stop short of it.
 */
export const elapsedAt = (run: Timed, officialM: number, meters: number): number | null => {
  if (meters >= officialM) return run.elapsedMs;
  const exact = meters % 1000 === 0 ? run.splits.find((s) => s.km * 1000 === meters) : undefined;
  if (exact) return exact.elapsedMs;
  const known: Array<{ m: number; ms: number }> = [{ m: 0, ms: 0 }, ...run.splits.map((s: Split) => ({ m: s.km * 1000, ms: s.elapsedMs })), { m: officialM, ms: run.elapsedMs }]
    .filter((p) => p.m <= officialM)
    .sort((a, b) => a.m - b.m);
  const after = known.findIndex((p) => p.m >= meters);
  if (after <= 0) return null;
  const a = known[after - 1]!;
  const b = known[after]!;
  // A gap in the splits wider than two kilometres is not read across: it would be a guess.
  if (b.m - a.m > 2000) return null;
  return Math.round(a.ms + ((meters - a.m) / (b.m - a.m)) * (b.ms - a.ms));
};

export type ReportCheckpoint = {
  /** Metres from the start; the last one is the finish, at the official distance. */
  meters: number;
  finish: boolean;
  elapsedMs: number;
  /** Time since the previous point (the start for the first). */
  segmentMs: number;
  /** Seconds per kilometre over that segment. */
  paceSecPerKm: number;
  /** Place in the field when passing here: 1 + the finishers who passed earlier. Null when the field is unknown. */
  place: number | null;
};

/** `negative`: the second half at least a second quicker than the first (an even run is not one). */
export type ReportHalves = { firstMs: number; secondMs: number; negative: boolean };

export type RaceReport = {
  checkpoints: ReportCheckpoint[];
  halves: ReportHalves | null;
  /** Place at the first timing point minus the final place: positive when the runner moved up. */
  placesGained: number | null;
  fastestKm: Split | null;
};

type Field = ReadonlyArray<Pick<Run, 'id' | 'elapsedMs' | 'splits'>>;

/**
 * The report of `run` among `field` (the course's ranked finishers, the runner included or
 * not). `rank` is the runner's official place, which the finish row carries as it is.
 */
export const raceReport = (run: Pick<Run, 'id' | 'elapsedMs' | 'splits'>, officialM: number, field: Field, rank: number | null): RaceReport => {
  const others = field.filter((r) => r.id !== run.id);
  const passed = checkpointMeters(officialM)
    .map((meters) => ({ meters, elapsedMs: elapsedAt(run, officialM, meters) }))
    .filter((p): p is { meters: number; elapsedMs: number } => p.elapsedMs !== null);
  const checkpoints = passed.map((p, i): ReportCheckpoint => {
    const prev = passed[i - 1] ?? { meters: 0, elapsedMs: 0 };
    const segmentMs = p.elapsedMs - prev.elapsedMs;
    const finish = p.meters >= officialM;
    const placeHere = (): number | null => {
      if (finish) return rank;
      if (field.length === 0) return null;
      const ahead = others.map((r) => elapsedAt(r, officialM, p.meters)).filter((ms): ms is number => ms !== null && ms < p.elapsedMs);
      return ahead.length + 1;
    };
    return { meters: p.meters, finish, elapsedMs: p.elapsedMs, segmentMs, paceSecPerKm: segmentMs / Math.max(1, p.meters - prev.meters), place: placeHere() };
  });
  const half = elapsedAt(run, officialM, officialM / 2);
  const halves = half !== null && run.splits.length >= 2 ? { firstMs: half, secondMs: run.elapsedMs - half, negative: run.elapsedMs - half <= half - 1000 } : null;
  const firstPlace = checkpoints[0]?.place ?? null;
  const last = checkpoints[checkpoints.length - 1];
  const placesGained = checkpoints.length >= 2 && firstPlace !== null && last?.finish && last.place !== null ? firstPlace - last.place : null;
  const fastestKm = run.splits.reduce<Split | null>((best, s) => (best === null || s.splitMs < best.splitMs ? s : best), null);
  return { checkpoints, halves, placesGained, fastestKm };
};

/** "5", "10", … and the finish as its distance: "42,195" on a marathon (the number every runner knows), "21,1", "10". */
export const checkpointLabel = (meters: number, officialM: number, locale: 'fr' | 'en'): string => {
  if (meters < officialM) return String(Math.round(meters / 1000));
  const km = officialM / 1000;
  const digits = Number.isInteger(km) ? 0 : officialM === 42195 ? 3 : 1;
  return km.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export type MarkPlacement = { x: number; y: number; atX: number; atY: number };

/**
 * Circles for the timing points on a drawn course, pushed off the line where they would sit on
 * one already placed (a double loop passes the same street twice). Each circle keeps where on
 * the course it belongs (`atX`, `atY`) so a short line can tie it back. `normals` are unit
 * vectors across the course at each point, in the same pixel space.
 */
export const placeMarks = (points: ReadonlyArray<{ x: number; y: number; nx: number; ny: number }>, radius: number, bounds: { width: number; height: number }): MarkPlacement[] => {
  const offsets = [0, 1, -1, 2, -2, 3, -3].map((k) => k * radius * 2.2);
  const inside = (x: number, y: number) => x >= radius && y >= radius && x <= bounds.width - radius && y <= bounds.height - radius;
  return points.reduce<MarkPlacement[]>((placed, p) => {
    const free = (x: number, y: number) => placed.every((q) => Math.hypot(q.x - x, q.y - y) >= radius * 2.1);
    const candidates = offsets.map((o) => ({ x: p.x + p.nx * o, y: p.y + p.ny * o }));
    const spot = candidates.find((c) => inside(c.x, c.y) && free(c.x, c.y)) ?? candidates.find((c) => free(c.x, c.y)) ?? candidates[0]!;
    return [...placed, { x: spot.x, y: spot.y, atX: p.x, atY: p.y }];
  }, []);
};
