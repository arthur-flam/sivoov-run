/**
 * Sample runs for the seeded test entrants, so the organizer's "Activités" screens and the
 * screenshots show real-looking data. Local and preview only, never production.
 *   npm run seed -w api -- local && npm run seed:runs -w api -- local
 *
 * - 1001 Marc, half: finished, from the Android app, full GPS trace, splits, announcements heard.
 * - 1002 Léa, marathon: stopped at 18.4 km, from the iPhone app.
 * - 1003 Arthur, half: a simulated test run.
 *
 * Traces come from the shared simulation along the Deauville course, and the splits, the
 * finish and the announcements from replaying them through the app's own tracker and triggers.
 * Idempotent: fixed run ids, rows upserted, trace files overwritten. Times are set relative to
 * now so "il y a 3 h" reads naturally; an organizer's decision to set a time aside is kept.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RunDiagnosticsSchema,
  RunSchema,
  RunTraceSchema,
  abandon,
  applySample,
  buildScript,
  buildTrack,
  constantPace,
  deauvilleMarathonGeometry,
  fadingPace,
  idleRun,
  nextEvents,
  officialStatus,
  simulateRun,
  startRun,
} from '@sivoov/shared';
import type { AudioEvent, DeviceInfo, LocationSample, PaceProfile, Run, RunSource, RunState, RunTrace } from '@sivoov/shared';
import { deauvilleCourses, deauvilleRace } from '../src/seed/deauville';
import { deauville2026MarathonScript } from '../src/seed/deauvilleScript';

const target = process.argv[2] ?? 'local';
if (!['local', 'preview'].includes(target)) throw new Error('usage: seed-runs.ts local|preview (sample runs never go to production)');

type Plan = {
  id: string;
  bib: string;
  courseId: string;
  /** How far the simulated runner goes before stopping. */
  runM: number;
  pace: PaceProfile;
  /** When the gun went: days before today at a Paris clock time, or `now` minus a few hours. */
  start: { daysAgo: number; at: string } | { hoursAgo: number };
  source: RunSource;
  device: DeviceInfo;
  noiseM: number;
  seed: number;
};

const PLANS: Plan[] = [
  {
    id: 'seed-1001-half', bib: '1001', courseId: 'deauville-2026-half', runM: 21_700, pace: fadingPace(298, 336, 21_000), start: { daysAgo: 1, at: '09:12' },
    source: 'app', device: { platform: 'android', model: 'Pixel 8', osVersion: '15', appVersion: '1.0.0' }, noiseM: 5, seed: 11,
  },
  {
    id: 'seed-1002-marathon', bib: '1002', courseId: 'deauville-2026-marathon', runM: 18_420, pace: fadingPace(325, 372, 18_000), start: { hoursAgo: 3 },
    source: 'app', device: { platform: 'ios', model: 'iPhone 15', osVersion: '18.1', appVersion: '1.0.0' }, noiseM: 6, seed: 12,
  },
  {
    id: 'seed-1003-simulation', bib: '1003', courseId: 'deauville-2026-half', runM: 3_000, pace: constantPace(300), start: { daysAgo: 2, at: '18:40' },
    source: 'simulation', device: { platform: 'android', model: 'Pixel 7', osVersion: '14', appVersion: '1.0.0' }, noiseM: 0, seed: 13,
  },
];

const track = buildTrack(deauvilleMarathonGeometry.points);
const scriptEvents = buildScript(deauville2026MarathonScript).events;
/** The announcements a course would carry: the Deauville script, cut to the course's distance. */
const eventsFor = (courseM: number): AudioEvent[] =>
  scriptEvents.filter((e) => e.trigger.kind !== 'distance' || e.trigger.meters < courseM - 500);

type Fired = RunTrace['audioFired'][number];
type Replay = { state: RunState; fired: Fired[]; keys: ReadonlySet<string>; used: number };

/** The app's run loop, offline: each fix through the tracker, then the triggers, until the finish line. */
const replay = (samples: LocationSample[], courseM: number, startMs: number, events: AudioEvent[]): Replay =>
  samples.reduce<Replay>(
    (acc, sample) => {
      if (acc.state.phase !== 'running') return acc;
      const state = applySample(acc.state, sample);
      const firings = nextEvents(state, { events }, acc.keys);
      return firings.length === 0
        ? { ...acc, state, used: acc.used + 1 }
        : {
            state,
            used: acc.used + 1,
            keys: new Set([...acc.keys, ...firings.map((f) => f.key)]),
            fired: [...acc.fired, ...firings.map((f) => ({ eventId: f.event.id, distanceM: Math.round(state.distanceM), elapsedMs: Math.round(state.elapsedMs) }))],
          };
    },
    { state: startRun(idleRun(courseM), startMs), fired: [], keys: new Set(), used: 0 },
  );

const iso = (ms: number) => new Date(ms).toISOString();
const now = Math.floor(Date.now() / 60_000) * 60_000;
/** The race's clock is Paris; November is UTC+1, close enough for sample data all year. */
const startOf = (start: Plan['start']): number => {
  if ('hoursAgo' in start) return now - start.hoursAgo * 3_600_000;
  const day = new Date(now - start.daysAgo * 86_400_000).toISOString().slice(0, 10);
  return new Date(`${day}T${start.at}:00+01:00`).getTime();
};

const built = PLANS.map((plan) => {
  const course = deauvilleCourses.find((c) => c.id === plan.courseId)!;
  const startMs = startOf(plan.start);
  const all = simulateRun({ track, targetM: plan.runM, pace: plan.pace, startTime: startMs, noiseM: plan.noiseM, seed: plan.seed });
  const done = replay(all, course.distanceM, startMs, eventsFor(course.distanceM));
  const state = done.state.phase === 'finished' ? done.state : abandon(done.state);
  const samples = all.slice(0, done.used);
  const run: Run = RunSchema.parse({
    id: plan.id,
    entrantId: `${deauvilleRace.id}-${plan.bib}`,
    courseId: course.id,
    status: officialStatus({ status: state.phase === 'finished' ? 'finished' : 'abandoned', source: plan.source, distanceM: state.distanceM }, course.distanceM),
    startedAt: iso(startMs),
    finishedAt: iso(startMs + state.elapsedMs + 4_000),
    elapsedMs: Math.round(state.elapsedMs),
    distanceM: state.distanceM,
    splits: state.splits,
    source: plan.source,
    device: plan.device,
  });
  const end = state.elapsedMs + 3_000;
  const diagnostics = RunDiagnosticsSchema.parse({
    counters: plan.source === 'simulation' ? {} : { 'task.batches': Math.ceil(samples.length / 5), 'task.fixes': samples.length, 'task.dropped': 0 },
    lines: [
      ...(plan.source === 'simulation'
        ? [{ atMs: 0, tag: 'run', message: 'simulation started' }]
        : [
            { atMs: 0, tag: 'location', message: 'background task sivoov-run-location defined' },
            { atMs: 1_800, tag: 'location', message: 'permission: always' },
            { atMs: 1_900, tag: 'location', message: 'starting background updates (task defined: true, was running: false)' },
            { atMs: 2_300, tag: 'location', message: 'background updates started' },
          ]),
      { atMs: end, tag: 'run', message: `${state.phase === 'finished' ? 'finished' : 'stopped'}: ${state.accepted} accepted, ${state.rejected} rejected, ${samples.length} samples, ${Math.round(state.distanceM)} m` },
      ...(plan.source === 'simulation' ? [] : [{ atMs: end + 400, tag: 'location', message: 'background updates stopped' }]),
    ],
  });
  const trace = RunTraceSchema.parse({ runId: plan.id, samples, audioFired: done.fired, diagnostics });
  return { run, trace, traceKey: `traces/${deauvilleRace.id}/${plan.id}.json`, receivedAt: iso(startMs + end + 60_000) };
});

const q = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`);
const sql = built
  .map(
    ({ run, traceKey, receivedAt }) => `INSERT INTO runs (id, entrant_id, course_id, status, started_at, finished_at, elapsed_ms, distance_m, splits, source, device, trace_key, created_at)
   VALUES (${[run.id, run.entrantId, run.courseId, run.status, run.startedAt ?? null, run.finishedAt ?? null, run.elapsedMs, run.distanceM, JSON.stringify(run.splits), run.source, run.device ? JSON.stringify(run.device) : null, traceKey, receivedAt].map(q).join(', ')})
   ON CONFLICT(id) DO UPDATE SET status=excluded.status, started_at=excluded.started_at, finished_at=excluded.finished_at, elapsed_ms=excluded.elapsed_ms,
     distance_m=excluded.distance_m, splits=excluded.splits, source=excluded.source, device=excluded.device, trace_key=excluded.trace_key, created_at=excluded.created_at;`,
  )
  .join('\n');

const dir = mkdtempSync(join(tmpdir(), 'sivoov-seed-runs-'));
const sqlFile = join(dir, 'runs.sql');
writeFileSync(sqlFile, sql);

const envFlag = target === 'local' ? ['--env', 'local'] : ['--env', 'preview'];
const dbName = target === 'preview' ? 'sivoov-run-preview' : 'sivoov-run';
const bucket = target === 'preview' ? 'sivoov-run-files-preview' : 'sivoov-run-files';
const where = target === 'local' ? ['--local'] : ['--remote'];
const wrangler = (args: string[]) => {
  console.log('> wrangler', args.join(' '));
  execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname });
};
wrangler(['d1', 'execute', dbName, ...where, ...envFlag, '--file', sqlFile]);
built.forEach(({ trace, traceKey }) => {
  const file = join(dir, `${trace.runId}.json`);
  writeFileSync(file, JSON.stringify(trace));
  wrangler(['r2', 'object', 'put', `${bucket}/${traceKey}`, '--file', file, '--content-type', 'application/json', ...(target === 'local' ? ['--local', '--env', 'local'] : ['--remote'])]);
});
built.forEach(({ run, trace }) =>
  console.log(`${run.id}: ${run.status}, ${(run.distanceM / 1000).toFixed(2)} km in ${Math.round(run.elapsedMs / 60_000)} min, ${trace.samples.length} fixes, ${trace.audioFired.length} announcements`),
);
console.log(`seeded sample runs on ${target}`);
