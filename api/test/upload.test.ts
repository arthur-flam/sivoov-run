import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { EntrantSchema, RaceSchema, RunTraceSchema, destination } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { deauvilleCourses, deauvilleRace, deauvilleTestEntrants } from '../src/seed/deauville';

const otherRace = RaceSchema.parse({ ...deauvilleRace, id: 'other-2026', slug: 'other-2026', name: 'Other', theme: { ...deauvilleRace.theme, displayName: 'Other' } });
const otherRunner = EntrantSchema.parse({
  id: 'other-2026-1', raceId: otherRace.id, bib: '1', email: 'other@example.com', firstName: 'Olga', lastName: 'Autre', distanceKey: 'half', source: 'manual',
});

beforeAll(async () => {
  const q = db(env.DB);
  await Promise.all([q.upsertRace(deauvilleRace), q.upsertRace(otherRace)]);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all([...deauvilleTestEntrants, otherRunner].map((e) => q.upsertEntrant(e)));
});

/** A web session for a test account: TEST_CODE signs @example.com entrants in on local. */
const sessionFor = async (raceSlug: string, bib: string, email: string): Promise<string> => {
  const res = await SELF.fetch('http://run.test/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raceSlug, bib, email, code: '000000' }),
  });
  expect(res.status).toBe(200);
  return `sivoov_session=${((await res.json()) as { token: string }).token}`;
};

const START = { lat: 49.36, lng: 0.07 };

/** A straight run due north, one point every 5 s, written the way a watch export writes it. */
const gpx = ({ start, meters, secPerKm }: { start: string; meters: number; secPerKm: number }): File => {
  const t0 = Date.parse(start);
  const n = Math.round(((meters / 1000) * secPerKm) / 5);
  const points = Array.from({ length: n + 1 }, (_, i) => {
    const p = destination(START, 0, (i * meters) / n);
    return `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><ele>4.0</ele><time>${new Date(t0 + i * 5000).toISOString()}</time></trkpt>`;
  });
  const xml = `<?xml version="1.0"?><gpx version="1.1" creator="Garmin Connect"><trk><name>Course</name><trkseg>${points.join('')}</trkseg></trk></gpx>`;
  return new File([xml], 'activity.gpx', { type: 'application/gpx+xml' });
};

/** Wednesday of race week, 8:00 in Deauville: a half at 5:00/km, a little past the line. */
const goodHalf = () => gpx({ start: '2026-11-11T08:00:00+01:00', meters: 21_300, secPerKm: 300 });

const send = (cookie: string, file: File | null) => {
  const form = new FormData();
  if (file) form.append('gpx', file);
  return SELF.fetch('http://run.test/deauville-2026/upload', { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: form, redirect: 'manual' });
};

const marcHalf = () => db(env.DB).resultsForCourse('deauville-2026-half').then((rows) => rows.filter((r) => r.entrant.bib === '1001'));

describe('the upload page', () => {
  it('sends a runner with no session to sign in, and sign-in brings them back', async () => {
    const page = await SELF.fetch('http://run.test/deauville-2026/upload', { redirect: 'manual' });
    expect(page.status).toBe(302);
    const signin = page.headers.get('location')!;
    expect(signin).toBe('/deauville-2026/signin?next=%2Fdeauville-2026%2Fupload');
    expect(await (await SELF.fetch(`http://run.test${signin}`)).text()).toContain('name="next" value="/deauville-2026/upload"');
    const signIn = (next: string) =>
      SELF.fetch('http://run.test/deauville-2026/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ step: 'code', bib: '1001', email: 'marc@example.com', code: '000000', next }).toString(),
        redirect: 'manual',
      });
    expect((await signIn('/deauville-2026/upload')).headers.get('location')).toBe('/deauville-2026/upload');
    // Only a path on this site: anything that leaves it falls back to the install page.
    for (const away of ['//evil.example/x', '/\\evil.example', 'https://evil.example/', '/.//evil.example']) {
      expect((await signIn(away)).headers.get('location')).toBe('/deauville-2026/app');
    }
    expect((await send('', goodHalf())).status).toBe(302);
  });

  it('shows the signed-in runner one file input and what is accepted, and the install page links to it', async () => {
    const cookie = await sessionFor('deauville-2026', '1001', 'marc@example.com');
    const html = await (await SELF.fetch('http://run.test/deauville-2026/upload', { headers: { Cookie: cookie } })).text();
    expect(html).toContain('Envoyer ma course');
    expect(html).toContain('type="file"');
    expect(html).toContain('Dossard 1001 · Semi-marathon');
    expect(html).toContain('du 9 novembre au 15 novembre');
    const install = await (await SELF.fetch('http://run.test/deauville-2026/app', { headers: { Cookie: cookie } })).text();
    expect(install).toContain('href="/deauville-2026/upload"');
  });
});

describe('an uploaded GPX', () => {
  it('joins the results as an upload, timed to the line, with its points kept as the trace', async () => {
    const cookie = await sessionFor('deauville-2026', '1001', 'marc@example.com');
    const res = await send(cookie, goodHalf());
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/deauville-2026/results/1001');

    const [row] = await marcHalf();
    expect(row!.run).toMatchObject({ source: 'upload', status: 'uploaded', startedAt: '2026-11-11T07:00:00.000Z', distanceM: 21097.5 });
    // 21.0975 km at 5:00/km is 1:45:29, whatever the watch did after the line.
    expect(Math.abs(row!.run.elapsedMs - 6_329_250)).toBeLessThan(5000);
    expect(row!.run.splits).toHaveLength(21);
    const trace = RunTraceSchema.parse(await (await env.FILES.get(`traces/deauville-2026/${row!.run.id}.json`))!.json());
    expect(trace.samples).toHaveLength(1279);
  });

  it('sent again, replaces itself instead of adding a second result', async () => {
    const cookie = await sessionFor('deauville-2026', '1001', 'marc@example.com');
    expect((await send(cookie, goodHalf())).status).toBe(303);
    expect((await send(cookie, goodHalf())).status).toBe(303);
    expect(await marcHalf()).toHaveLength(1);
    expect((await db(env.DB).runsForEntrant('deauville-2026-1001')).filter((r) => r.source === 'upload')).toHaveLength(1);
  });

  it('is refused with the reason and what to do, and nothing is stored', async () => {
    const cookie = await sessionFor('deauville-2026', '1002', 'lea@example.com');
    const refused = async (file: File | null, status: number, text: string) => {
      const res = await send(cookie, file);
      expect(res.status).toBe(status);
      const html = await res.text();
      expect(html).toContain('role="alert"');
      expect(html).toContain(text);
      expect(html).toContain('type="file"');
    };
    const treadmill = new File(['<gpx><trk><trkseg><trkpt><time>2026-11-11T08:00:00Z</time></trkpt><trkpt><time>2026-11-11T08:00:01Z</time></trkpt></trkseg></trk></gpx>'], 't.gpx');
    await refused(new File([], ''), 400, 'Choisissez un fichier GPX');
    await refused(new File(['x'.repeat(10 * 1024 * 1024 + 1)], 'big.gpx'), 413, 'dépasse 10 Mo');
    await refused(new File(['not a gpx'], 'run.fit'), 422, 'Aucune trace dans ce fichier');
    await refused(treadmill, 422, 'course sur tapis');
    // Léa's course is the marathon: a half is short, and the page says by how much.
    await refused(goodHalf(), 422, 'Nous avons mesuré 21,30 km sur les 42,2 km du parcours : il manque 20,90 km');
    await refused(gpx({ start: '2026-11-01T09:00:00+01:00', meters: 42_300, secPerKm: 330 }), 422, 'Cette course est partie le 1 novembre à 09:00, avant l’ouverture de la fenêtre');
    await refused(gpx({ start: '2026-11-12T09:00:00+01:00', meters: 42_300, secPerKm: 150 }), 422, 'plus rapide que le record du monde');
    expect(await db(env.DB).runsForEntrant('deauville-2026-1002')).toEqual([]);
  });

  it('is always the signed-in runner’s, judged on their own course, and never another race’s', async () => {
    // The same half from Léa is judged against her marathon, and Marc's result does not move.
    const before = await marcHalf();
    const lea = await sessionFor('deauville-2026', '1002', 'lea@example.com');
    expect((await send(lea, goodHalf())).status).toBe(422);
    expect(await marcHalf()).toEqual(before);
    // A session from another race is not a session here.
    const olga = await sessionFor('other-2026', '1', 'other@example.com');
    const res = await send(olga, goodHalf());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/deauville-2026/signin?next=%2Fdeauville-2026%2Fupload');
    expect(await db(env.DB).runsForEntrant(otherRunner.id)).toEqual([]);
  });
});
