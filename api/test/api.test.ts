import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/queries';
import { deauvilleCourses, deauvilleRace, deauvilleTestEntrants } from '../src/seed/deauville';
import { sha256Hex } from '../src/lib/crypto';

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all(deauvilleTestEntrants.map((e) => q.upsertEntrant(e)));
});

/** Reads the last code issued for an entrant straight from the DB, as the email would. */
const codeFor = async (entrantId: string): Promise<string> => {
  const row = await env.DB.prepare('SELECT code_hash FROM auth_codes WHERE entrant_id = ? AND consumed_at IS NULL ORDER BY created_at DESC').bind(entrantId).first<{ code_hash: string }>();
  for (let n = 0; n < 1_000_000; n++) {
    const code = String(n).padStart(6, '0');
    if ((await sha256Hex(code)) === row?.code_hash) return code;
  }
  throw new Error('code not found');
};

const signIn = async (bib: string, email: string) => {
  const sent = await SELF.fetch('http://run.test/api/auth/code', json({ raceSlug: 'deauville-2026', bib, email }));
  expect(sent.status).toBe(200);
  const { devCode } = (await sent.json()) as { devCode?: string };
  const entrant = deauvilleTestEntrants.find((e) => e.bib === bib)!;
  const code = devCode ?? (await codeFor(entrant.id));
  const verified = await SELF.fetch('http://run.test/api/auth/verify', json({ raceSlug: 'deauville-2026', bib, email, code }));
  expect(verified.status).toBe(200);
  return (await verified.json()) as { token: string; entrant: { id: string; firstName: string } };
};

describe('health and race', () => {
  it('answers health', async () => {
    const res = await SELF.fetch('http://run.test/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, environment: 'local' });
  });
  it('serves the race with its courses', async () => {
    const res = await SELF.fetch('http://run.test/api/races/deauville-2026');
    const body = (await res.json()) as { race: { slug: string }; courses: Array<{ distanceKey: string }> };
    expect(body.race.slug).toBe('deauville-2026');
    expect(body.courses.map((c) => c.distanceKey)).toEqual(['marathon', 'half']);
  });
  it('404s an unknown race', async () => {
    expect((await SELF.fetch('http://run.test/api/races/nope')).status).toBe(404);
  });
  it('serves course geometry from the bundled fixture when R2 is empty', async () => {
    const res = await SELF.fetch('http://run.test/api/courses/deauville-2026-half/geometry');
    const body = (await res.json()) as { courseId: string; points: unknown[] };
    expect(body.courseId).toBe('deauville-2026-half');
    expect(body.points.length).toBeGreaterThan(1000);
  });
});

describe('magic code sign-in', () => {
  it('refuses an unknown bib/email pair without leaking which', async () => {
    const res = await SELF.fetch('http://run.test/api/auth/code', json({ raceSlug: 'deauville-2026', bib: '1001', email: 'nobody@example.com' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'unknown_entrant' });
  });
  it('validates the payload', async () => {
    expect((await SELF.fetch('http://run.test/api/auth/code', json({ bib: '1' }))).status).toBe(400);
  });
  it('signs in with the code and serves /me', async () => {
    const { token, entrant } = await signIn('1001', 'Marc@Example.com');
    expect(entrant.firstName).toBe('Marc');
    const me = await SELF.fetch('http://run.test/api/me', { headers: { Authorization: `Bearer ${token}` } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { entrant: { bib: string; email?: string }; race: { slug: string }; course: { distanceKey: string } };
    expect(body.entrant.bib).toBe('1001');
    expect(body.entrant.email).toBeUndefined();
    expect(body.race.slug).toBe('deauville-2026');
    expect(body.course.distanceKey).toBe('half');
  });
  it('rejects a wrong code and a consumed code', async () => {
    const sent = await SELF.fetch('http://run.test/api/auth/code', json({ raceSlug: 'deauville-2026', bib: '1002', email: 'lea@example.com' }));
    expect(sent.status).toBe(200);
    const wrong = await SELF.fetch('http://run.test/api/auth/verify', json({ raceSlug: 'deauville-2026', bib: '1002', email: 'lea@example.com', code: '000000' }));
    expect([401, 200]).toContain(wrong.status);
    const code = await codeFor('deauville-2026-1002');
    if (wrong.status === 200) return; // one in a million: the random code was 000000
    const right = await SELF.fetch('http://run.test/api/auth/verify', json({ raceSlug: 'deauville-2026', bib: '1002', email: 'lea@example.com', code }));
    expect(right.status).toBe(200);
    const again = await SELF.fetch('http://run.test/api/auth/verify', json({ raceSlug: 'deauville-2026', bib: '1002', email: 'lea@example.com', code }));
    expect(again.status).toBe(401);
  });
  it('requires a bearer token on /me and /runs', async () => {
    expect((await SELF.fetch('http://run.test/api/me')).status).toBe(401);
    expect((await SELF.fetch('http://run.test/api/runs')).status).toBe(401);
  });
});

describe('runs', () => {
  it('stores a finished run with its trace, idempotently, and lists it in results', async () => {
    const { token } = await signIn('1003', 'arthur.flam@gmail.com');
    const run = {
      id: 'run-1', entrantId: 'deauville-2026-1003', courseId: 'deauville-2026-half', status: 'finished', source: 'simulation',
      startedAt: '2026-11-10T09:00:00+01:00', finishedAt: '2026-11-10T10:45:00+01:00', elapsedMs: 6_300_000, distanceM: 21097.5,
      splits: [{ km: 1, elapsedMs: 300000, splitMs: 300000 }], device: { platform: 'web' },
    };
    const trace = { runId: 'run-1', samples: [{ lat: 49.36, lng: 0.07, timestamp: 1 }], audioFired: [{ eventId: 'gun', distanceM: 0, elapsedMs: 0 }] };
    const put = (body: unknown) => SELF.fetch('http://run.test/api/runs/run-1', { ...json(body, { Authorization: `Bearer ${token}` }), method: 'PUT' });
    expect((await put({ run, trace })).status).toBe(200);
    expect((await put({ run: { ...run, elapsedMs: 6_200_000 } })).status).toBe(200);
    const listed = (await (await SELF.fetch('http://run.test/api/runs', { headers: { Authorization: `Bearer ${token}` } })).json()) as { runs: Array<{ elapsedMs: number }> };
    expect(listed.runs).toHaveLength(1);
    expect(listed.runs[0]!.elapsedMs).toBe(6_200_000);
    const stored = await env.FILES.get('traces/deauville-2026/run-1.json');
    expect(stored).not.toBeNull();
    const page = await SELF.fetch('http://run.test/deauville-2026/results?distance=half');
    const html = await page.text();
    expect(html).toContain('FLAM');
    expect(html).toContain('1:43:20');
  });
  it('refuses a run for someone else', async () => {
    const { token } = await signIn('1001', 'marc@example.com');
    const res = await SELF.fetch('http://run.test/api/runs/run-x', {
      ...json({ run: { id: 'run-x', entrantId: 'deauville-2026-1003', courseId: 'deauville-2026-half', status: 'finished', source: 'app' } }, { Authorization: `Bearer ${token}` }),
      method: 'PUT',
    });
    expect(res.status).toBe(403);
  });
});

describe('pages', () => {
  it('renders the landing in French by default and in English on request', async () => {
    const fr = await (await SELF.fetch('http://run.test/deauville-2026')).text();
    expect(fr).toContain('Course virtuelle officielle');
    expect(fr).toContain('Marathon International de Deauville');
    expect(fr).toContain('<svg');
    const en = await (await SELF.fetch('http://run.test/deauville-2026?lang=en')).text();
    expect(en).toContain('Official virtual race');
  });
  it('walks the sign-in form to the install page with a cookie session', async () => {
    const form = (fields: Record<string, string>, cookie = '') =>
      SELF.fetch('http://run.test/deauville-2026/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
        body: new URLSearchParams(fields).toString(),
        redirect: 'manual',
      });
    const step1 = await form({ step: 'identify', bib: '1001', email: 'marc@example.com' });
    expect(step1.status).toBe(200);
    expect(await step1.text()).toContain('name="code"');
    const code = await codeFor('deauville-2026-1001');
    const step2 = await form({ step: 'code', bib: '1001', email: 'marc@example.com', code });
    expect(step2.status).toBe(302);
    expect(step2.headers.get('location')).toBe('/deauville-2026/app');
    const cookie = step2.headers.get('set-cookie')!.split(';')[0]!;
    const app = await SELF.fetch('http://run.test/deauville-2026/app', { headers: { Cookie: cookie } });
    expect(await app.text()).toContain('Bienvenue, Marc.');
    const unknown = await form({ step: 'identify', bib: '9999', email: 'marc@example.com' });
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toContain('Nous ne trouvons pas');
  });
  it('redirects /app to sign-in without a session', async () => {
    const res = await SELF.fetch('http://run.test/deauville-2026/app', { redirect: 'manual' });
    expect(res.status).toBe(302);
  });
});
