import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AudioPackSchema,
  CourseSchema,
  EntrantSchema,
  RaceSchema,
  RunSchema,
  RunTraceSchema,
  buildTrack,
  constantPace,
  deauvilleMarathonGeometry,
  parseGpx,
  simulateRun,
} from '@sivoov/shared';
import type { Run, RunTrace } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { adminDb } from '../src/db/adminQueries';
import { deauvilleCourses, deauvilleOrganizers, deauvilleRace } from '../src/seed/deauville';

const SLUG = 'deauville-2026';
const ORG = 'http://run.test/org';
const base = `${ORG}/${SLUG}`;
const HALF = `${SLUG}-half`;
const MARATHON = `${SLUG}-marathon`;

/** Another race with its own runner and run: never visible from Deauville's admin. */
const otherRace = RaceSchema.parse({ ...deauvilleRace, id: 'autre-2026', slug: 'autre-2026', name: 'Autre course', theme: { ...deauvilleRace.theme, displayName: 'Autre course' } });
const otherCourse = CourseSchema.parse({ id: 'autre-2026-half', raceId: otherRace.id, distanceKey: 'half', distanceM: 21097.5, landmarks: [] });

const entrant = (bib: string, firstName: string, lastName: string, distanceKey: string, raceId = SLUG) =>
  EntrantSchema.parse({ id: `${raceId}-${bib}`, raceId, bib, email: `${firstName.toLowerCase()}@example.com`, firstName, lastName, distanceKey, source: 'manual' });
const entrants = [
  entrant('4001', 'Nina', 'Petit', 'half'),
  entrant('4002', 'Hugo', 'Roux', 'marathon'),
  entrant('4003', 'Zoe', 'Blanc', 'half'),
  entrant('9001', 'Theo', 'Ailleurs', 'half', otherRace.id),
];

const GUN = Date.parse('2026-11-12T08:00:00Z');
const at = (minutes: number) => new Date(GUN + minutes * 60_000).toISOString();

/** A half at 5:00/km with a slow 7th kilometre, ending at 1:45:30. */
const halfSplits = Array.from({ length: 21 }, (_, i) => i + 1).map((km) => ({ km, splitMs: km === 7 ? 330_000 : km === 3 ? 290_000 : 300_000 }));
const splits = halfSplits.map((s, i) => ({ ...s, elapsedMs: halfSplits.slice(0, i + 1).reduce((n, x) => n + x.splitMs, 0) }));

const run = (fields: Partial<Run> & Pick<Run, 'id' | 'entrantId' | 'courseId' | 'status'>): Run =>
  RunSchema.parse({ source: 'app', startedAt: at(0), finishedAt: at(100), elapsedMs: 6_000_000, distanceM: 0, splits: [], ...fields });

const finished = run({
  id: 'run-fin', entrantId: `${SLUG}-4001`, courseId: HALF, status: 'finished', finishedAt: at(106), elapsedMs: 6_330_000, distanceM: 21097.5, splits,
  device: { platform: 'android', model: 'Pixel 8', osVersion: '15', appVersion: '1.0.0' },
});
const track = buildTrack(deauvilleMarathonGeometry.points);
const trace: RunTrace = RunTraceSchema.parse({
  runId: 'run-fin',
  samples: simulateRun({ track, targetM: 21097.5, pace: constantPace(300), startTime: GUN, intervalMs: 30_000 }),
  audioFired: [
    { eventId: 'ceremony.gun', distanceM: 0, elapsedMs: 0 },
    { eventId: 'course.planches', distanceM: 210, elapsedMs: 63_000 },
    { eventId: 'personal.split', distanceM: 1000, elapsedMs: 300_000 },
    { eventId: 'personal.split', distanceM: 2000, elapsedMs: 600_000 },
    { eventId: 'mystery.big-hill', distanceM: 5000, elapsedMs: 1_500_000 },
  ],
  diagnostics: { counters: { 'task.fixes': 212 }, lines: [{ atMs: 6_330_000, tag: 'run', message: 'finished: 200 accepted, 12 rejected, 212 samples, 21098 m' }] },
});

const runs: Array<{ run: Run; traceKey: string | null }> = [
  { run: finished, traceKey: `traces/${SLUG}/run-fin.json` },
  { run: run({ id: 'run-stop', entrantId: `${SLUG}-4002`, courseId: MARATHON, status: 'abandoned', finishedAt: at(110), distanceM: 18_420 }), traceKey: null },
  { run: run({ id: 'run-sim', entrantId: `${SLUG}-4003`, courseId: HALF, status: 'abandoned', source: 'simulation', finishedAt: at(20), distanceM: 3000 }), traceKey: null },
  { run: run({ id: 'run-live', entrantId: `${SLUG}-4003`, courseId: HALF, status: 'running', finishedAt: at(200), distanceM: 5000 }), traceKey: null },
  { run: run({ id: 'run-excl', entrantId: `${SLUG}-4002`, courseId: MARATHON, status: 'finished', finishedAt: at(30), elapsedMs: 1_700_000, distanceM: 42195 }), traceKey: null },
  { run: run({ id: 'run-zoe-fast', entrantId: `${SLUG}-4003`, courseId: HALF, status: 'finished', finishedAt: at(150), elapsedMs: 5_400_000, distanceM: 21097.5 }), traceKey: null },
  { run: run({ id: 'run-zoe-slow', entrantId: `${SLUG}-4003`, courseId: HALF, status: 'finished', finishedAt: at(140), elapsedMs: 6_600_000, distanceM: 21097.5 }), traceKey: null },
  { run: run({ id: 'run-other', entrantId: `${otherRace.id}-9001`, courseId: otherCourse.id, status: 'finished', distanceM: 21097.5 }), traceKey: `traces/${otherRace.id}/run-other.json` },
];

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await q.upsertRace(otherRace);
  await Promise.all([...deauvilleCourses, otherCourse].map((c) => q.upsertCourse(c)));
  await Promise.all(entrants.map((e) => q.upsertEntrant(e)));
  await Promise.all(deauvilleOrganizers.map((o) => adminDb(env.DB).upsertOrganizer(o)));
  await Promise.all(runs.map((r) => q.upsertRun(r.run, r.traceKey)));
  await env.FILES.put(`traces/${SLUG}/run-fin.json`, JSON.stringify(trace));
  await env.FILES.put(`traces/${otherRace.id}/run-other.json`, JSON.stringify({ ...trace, runId: 'run-other' }));
  // An organizer set this one aside earlier (a car, 42 km in 28 minutes).
  await env.DB.prepare("UPDATE runs SET excluded_at = ?, excluded_reason = 'Doublon', excluded_by = 'orga@example.com' WHERE id = 'run-excl'").bind(at(40)).run();
  // The published announcements name two of the events the runner heard.
  await q.upsertAudioPack(
    AudioPackSchema.parse({
      courseId: HALF, version: 1, locale: 'fr', files: {},
      events: [
        { id: 'ceremony.gun', title: 'Le départ', trigger: { kind: 'start' }, source: { kind: 'file', key: 'gun.mp3' }, category: 'ceremony' },
        { id: 'course.planches', title: 'Les Planches', trigger: { kind: 'distance', meters: 200 }, source: { kind: 'file', key: 'planches.mp3' }, category: 'course' },
      ],
    }),
  );
});

const post = (url: string, fields: Record<string, string>, cookie = '') =>
  SELF.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });
const get = (url: string, cookie = '') => SELF.fetch(url, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });
const page = async (url: string, cookie: string) => {
  const res = await get(url, cookie);
  expect(res.status).toBe(200);
  return res.text();
};
/** A session in one post: test addresses take the fixed test code. */
const cookieFor = async (email: string): Promise<string> => {
  const res = await post(`${ORG}/signin`, { step: 'code', email, code: env.TEST_CODE! });
  expect(res.status).toBe(302);
  return res.headers.get('set-cookie')!.split(';')[0]!;
};
/** Run ids linked from a list page, in the order shown. */
const listed = (html: string) => [...html.matchAll(/href="\/org\/deauville-2026\/runs\/([\w-]+)"/g)].map((m) => m[1]);
const exclusionOf = (id: string) =>
  env.DB.prepare('SELECT excluded_at, excluded_reason, excluded_by FROM runs WHERE id = ?').bind(id).first<{ excluded_at: string | null; excluded_reason: string | null; excluded_by: string | null }>();

describe('the list of activities', () => {
  it('shows every run of the race and only this race, newest first', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const html = await page(`${base}/runs`, cookie);
    expect(listed(html)).toEqual(['run-live', 'run-zoe-fast', 'run-zoe-slow', 'run-stop', 'run-fin', 'run-excl', 'run-sim']);
    expect(html).toContain('Nina PETIT');
    expect(html).toContain('Dossard 4001');
    expect(html).toContain('Application Android');
    expect(html).toContain('21,10 km');
    expect(html).not.toContain('AILLEURS');
  });
  it('filters by outcome, with the count of each filter on its chip', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const all = await page(`${base}/runs`, cookie);
    expect(all).toContain('Toutes<span class="n">7</span>');
    expect(all).toContain('Arrivés<span class="n">3</span>');
    expect(all).toContain('Écartés<span class="n">1</span>');
    expect(listed(await page(`${base}/runs?filter=finished`, cookie))).toEqual(['run-zoe-fast', 'run-zoe-slow', 'run-fin']);
    expect(listed(await page(`${base}/runs?filter=not_finished`, cookie))).toEqual(['run-stop']);
    expect(listed(await page(`${base}/runs?filter=running`, cookie))).toEqual(['run-live']);
    expect(listed(await page(`${base}/runs?filter=excluded`, cookie))).toEqual(['run-excl']);
    expect(listed(await page(`${base}/runs?filter=simulated`, cookie))).toEqual(['run-sim']);
    // An address with a filter that does not exist shows everything.
    expect(listed(await page(`${base}/runs?filter=nope`, cookie))).toHaveLength(7);
  });
  it('filters by distance and finds a runner by bib or name', async () => {
    const cookie = await cookieFor('lecture@example.com');
    expect(listed(await page(`${base}/runs?distance=marathon`, cookie))).toEqual(['run-stop', 'run-excl']);
    expect(listed(await page(`${base}/runs?distance=marathon&filter=excluded`, cookie))).toEqual(['run-excl']);
    expect(listed(await page(`${base}/runs?q=4001`, cookie))).toEqual(['run-fin']);
    expect(listed(await page(`${base}/runs?q=petit`, cookie))).toEqual(['run-fin']);
    const none = await page(`${base}/runs?q=personne`, cookie);
    expect(listed(none)).toEqual([]);
    expect(none).toContain('Effacer la recherche');
  });
  it('says what an empty filter means', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const html = await page(`${base}/runs?distance=marathon&filter=simulated`, cookie);
    expect(html).toContain('Aucun essai simulé.');
  });
  it('asks a visitor to sign in first', async () => {
    const res = await get(`${base}/runs`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/org/signin');
  });
});

describe('one activity', () => {
  it('shows the official time, the kilometres and what the runner heard', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const html = await page(`${base}/runs/run-fin?map=svg`, cookie);
    expect(html).toContain('Nina PETIT');
    expect(html).toContain('Temps officiel');
    expect(html).toContain('1:45:30');
    // Splits: one row per kilometre, the fastest (km 3) and the slowest (km 7) marked.
    expect(html).toContain('Le plus rapide');
    expect(html).toContain('Le plus lent');
    expect(html).toContain('5:30');
    // Heard: titles from the published announcements, a readable name otherwise, repeats folded.
    expect(html).toContain('Le départ');
    expect(html).toContain('Les Planches');
    expect(html).toContain('Big hill');
    expect(html).toContain('2 fois');
    // The runner's own trace, drawn without tiles, and the phone.
    expect(html).toContain('aria-label="Tracé GPS du coureur"');
    expect(html).toContain('Pixel 8');
    expect(html).toContain('200 points retenus, 12 écartés');
    expect(html).toContain('href="/org/deauville-2026/runners/4001"');
  });
  it('says in one sentence why a time does not count', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const stopped = await page(`${base}/runs/run-stop`, cookie);
    expect(stopped).toContain('arrêt avant l’arrivée, 18,4 km parcourus sur 42,2 km');
    expect(stopped).toContain('Pas de tracé pour cette course.');
    expect(await page(`${base}/runs/run-sim`, cookie)).toContain('c’est un essai simulé');
    const excluded = await page(`${base}/runs/run-excl`, cookie);
    expect(excluded).toContain('il a été écarté le 12 nov. à 09:40 par orga@example.com. Motif : Doublon.');
  });
  it('is not found from another race’s admin', async () => {
    const cookie = await cookieFor('equipe@example.com');
    expect((await get(`${base}/runs/run-other`, cookie)).status).toBe(404);
    expect((await get(`${base}/runs/run-other/trace.gpx`, cookie)).status).toBe(404);
    expect((await post(`${base}/runs/run-other/exclude`, { reason: 'gps' }, cookie)).status).toBe(404);
    expect((await exclusionOf('run-other'))?.excluded_at).toBeNull();
    expect((await get(`${base}/runs/nope`, cookie)).status).toBe(404);
  });
});

describe('downloads', () => {
  it('gives the trace as a GPX file with every GPS fix', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const res = await get(`${base}/runs/run-fin/trace.gpx`, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/gpx+xml');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="deauville-2026-4001-run-fin.gpx"');
    const gpx = parseGpx(await res.text());
    expect(gpx.name).toBe('Nina Petit, Semi-marathon, dossard 4001');
    expect(gpx.points).toHaveLength(trace.samples.length);
    expect(gpx.points[0]!.lat).toBeCloseTo(trace.samples[0]!.lat, 6);
  });
  it('gives the raw data as the phone sent it, and nothing for a run without a trace', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const res = await get(`${base}/runs/run-fin/trace.json`, cookie);
    expect(res.status).toBe(200);
    expect(RunTraceSchema.parse(await res.json()).audioFired).toHaveLength(5);
    expect((await get(`${base}/runs/run-stop/trace.gpx`, cookie)).status).toBe(404);
    expect((await get(`${base}/runs/run-stop/trace.json`, cookie)).status).toBe(404);
  });
});

describe('setting a time aside', () => {
  it('is not offered to a read-only member, and the route refuses it', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const html = await page(`${base}/runs/run-fin`, cookie);
    expect(html).not.toContain('/runs/run-fin/exclude');
    const res = await post(`${base}/runs/run-fin/exclude`, { reason: 'gps' }, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/org/${SLUG}?denied=1`);
    expect((await exclusionOf('run-fin'))?.excluded_at).toBeNull();
    expect((await post(`${base}/runs/run-excl/restore`, {}, cookie)).headers.get('location')).toBe(`/org/${SLUG}?denied=1`);
    expect((await exclusionOf('run-excl'))?.excluded_at).not.toBeNull();
  });
  it('asks for a reason and keeps the note typed', async () => {
    const cookie = await cookieFor('equipe@example.com');
    const res = await post(`${base}/runs/run-fin/exclude`, { note: 'Vu sur Strava' }, cookie);
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain('Choisissez un motif.');
    expect(html).toContain('Vu sur Strava</textarea>');
    expect((await exclusionOf('run-fin'))?.excluded_at).toBeNull();
  });
  it('takes the time out of the public results and the results file, survives a re-send by the app, and comes back', async () => {
    const cookie = await cookieFor('equipe@example.com');
    const results = async () => (await SELF.fetch(`http://run.test/${SLUG}/results?distance=half`)).text();
    const csv = async () => (await get(`${base}/export/results.csv`, cookie)).text();
    expect(await results()).toContain('PETIT');
    expect(await csv()).toContain('4001;Nina;Petit;Semi-marathon;1:45:30;6330;21098;Arrivé;');

    const res = await post(`${base}/runs/run-fin/exclude`, { reason: 'gps', note: 'Saut de 2 km au km 12.' }, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/org/${SLUG}/runs/run-fin?done=excluded`);
    expect(await exclusionOf('run-fin')).toMatchObject({ excluded_reason: 'Problème de GPS. Saut de 2 km au km 12.', excluded_by: 'equipe@example.com' });
    expect(await results()).not.toContain('PETIT');
    expect(await csv()).toContain('4001;Nina;Petit;Semi-marathon;1:45:30;6330;21098;Écarté;');
    const detail = await page(`${base}/runs/run-fin?done=excluded`, cookie);
    expect(detail).toContain('Temps écarté. Il n’apparaît plus dans les résultats');
    expect(detail).toContain('Rétablir ce temps');
    expect(listed(await page(`${base}/runs?filter=excluded`, cookie))).toEqual(['run-fin', 'run-excl']);

    // The app sends the same run again (its offline queue retries): the decision stays.
    const signin = await SELF.fetch('http://run.test/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raceSlug: SLUG, bib: '4001', email: 'nina@example.com', code: env.TEST_CODE }),
    });
    const { token } = (await signin.json()) as { token: string };
    const resend = await SELF.fetch('http://run.test/api/runs/run-fin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ run: finished, trace }),
    });
    expect(resend.status).toBe(200);
    expect((await exclusionOf('run-fin'))?.excluded_by).toBe('equipe@example.com');
    expect(await results()).not.toContain('PETIT');

    const back = await post(`${base}/runs/run-fin/restore`, {}, cookie);
    expect(back.headers.get('location')).toBe(`/org/${SLUG}/runs/run-fin?done=restored`);
    expect(await exclusionOf('run-fin')).toEqual({ excluded_at: null, excluded_reason: null, excluded_by: null });
    expect(await results()).toContain('PETIT');
    expect(await csv()).toContain('4001;Nina;Petit;Semi-marathon;1:45:30;6330;21098;Arrivé;');
  });
  it('makes a runner’s next best time their result when the best one is set aside', async () => {
    const cookie = await cookieFor('orga@example.com');
    expect(await (await SELF.fetch(`http://run.test/${SLUG}/results?distance=half`)).text()).toContain('1:30:00');
    expect((await post(`${base}/runs/run-zoe-fast/exclude`, { reason: 'not_running' }, cookie)).status).toBe(302);
    const html = await (await SELF.fetch(`http://run.test/${SLUG}/results?distance=half`)).text();
    expect(html).toContain('BLANC');
    expect(html).toContain('1:50:00');
    expect(html).not.toContain('1:30:00');
    expect((await exclusionOf('run-zoe-fast'))?.excluded_reason).toBe('Ce n’est pas une course à pied (vélo, voiture, etc.)');
  });
});
