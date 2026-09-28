import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { CourseSchema, EntrantSchema, REVIEW_BIB, REVIEW_EMAIL, RaceSchema } from '@sivoov/shared';
import type { Race } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { dashboardDb } from '../src/db/dashboardQueries';
import { makeDemo } from '../src/lib/demo';
import { deauvilleCourses, deauvilleRace } from '../src/seed/deauville';

// A race of its own, so what other suites seed or upload never moves a number here.
const source = RaceSchema.parse({ ...deauvilleRace, id: 'democ-2026', slug: 'democ-2026', theme: { ...deauvilleRace.theme, displayName: 'Démo Deauville' } });
const courses = deauvilleCourses.map((c) => CourseSchema.parse({ ...c, id: c.id.replace('deauville-2026', 'democ-2026'), raceId: source.id }));
const [marathon, half] = courses as [(typeof courses)[0], (typeof courses)[0]];
const other = RaceSchema.parse({ ...deauvilleRace, id: 'democ-other', slug: 'democ-other', theme: { ...deauvilleRace.theme, displayName: 'Autre course' } });
const runner = (id: string, raceId: string, bib: string, email: string, firstName: string) =>
  EntrantSchema.parse({ id, raceId, bib, email, firstName, lastName: 'Test', distanceKey: 'half', source: 'manual' });
const solo = runner('democ-solo', source.id, '3001', 'solo@example.com', 'Solène');
const twoRaces = [runner('democ-both-1', source.id, '3002', 'both@example.com', 'Bruno'), runner('democ-both-2', other.id, '7', 'both@example.com', 'Bruno')];
const family = [runner('democ-fam-1', source.id, '3003', 'family@example.com', 'Paul'), runner('democ-fam-2', source.id, '3004', 'family@example.com', 'Lina')];

const json = (body: unknown, method = 'POST', token?: string) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const code = (body: Record<string, string>) => SELF.fetch('http://run.test/api/auth/code', json(body));
const verify = (body: Record<string, string>) => SELF.fetch('http://run.test/api/auth/verify', json(body));
/** Email, then the fixed code: local accepts TEST_CODE for test accounts. */
const signIn = async (body: Record<string, string>, fixed: string = env.TEST_CODE!): Promise<string> => {
  expect((await code(body)).status).toBe(200);
  const res = await verify({ ...body, code: fixed });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
};

let demo: Race;

beforeAll(async () => {
  const q = db(env.DB);
  await Promise.all([q.upsertRace(source), q.upsertRace(other)]);
  await Promise.all(courses.map((c) => q.upsertCourse(c)));
  await q.upsertCourse(CourseSchema.parse({ ...half, id: 'democ-other-half', raceId: other.id }));
  await Promise.all([solo, ...twoRaces, ...family].map((e) => q.upsertEntrant(e)));
  const made = await makeDemo(env, source, new Date());
  if (!made.ok) throw new Error('no demo');
  demo = made.demo;
});

describe('sign-in by email', () => {
  it('needs only the email when it holds one entry', async () => {
    const token = await signIn({ email: 'Solo@Example.com' });
    const me = (await (await SELF.fetch('http://run.test/api/me', { headers: { Authorization: `Bearer ${token}` } })).json()) as { entrant: { bib: string } };
    expect(me.entrant.bib).toBe('3001');
  });
  it('asks which race when the email is entered in two, and takes the one named', async () => {
    const res = await code({ email: 'both@example.com' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'ambiguous',
      // Same dates: by bib then, as the list reads.
      races: [
        { slug: 'democ-other', name: 'Autre course' },
        { slug: 'democ-2026', name: 'Démo Deauville' },
      ],
      bib: false,
    });
    const token = await signIn({ email: 'both@example.com', raceSlug: 'democ-other' });
    const me = (await (await SELF.fetch('http://run.test/api/me', { headers: { Authorization: `Bearer ${token}` } })).json()) as { race: { slug: string } };
    expect(me.race.slug).toBe('democ-other');
  });
  it('asks for the bib when a family shares one email in one race', async () => {
    const res = await code({ email: 'family@example.com', raceSlug: 'democ-2026' });
    expect(await res.json()).toMatchObject({ error: 'ambiguous', bib: true });
    expect((await verify({ email: 'family@example.com', raceSlug: 'democ-2026', code: env.TEST_CODE! })).status).toBe(409);
    await signIn({ email: 'family@example.com', raceSlug: 'democ-2026', bib: '3004' });
  });
  it('still signs in an app that sends the race and the bib (older builds)', async () => {
    await signIn({ email: 'solo@example.com', raceSlug: 'democ-2026', bib: '3001' });
  });
  it('asks the bib on the web sign-in when the page’s race has two entries for the email', async () => {
    const post = (fields: Record<string, string>) => SELF.fetch('http://run.test/democ-2026/signin', { method: 'POST', body: new URLSearchParams(fields) });
    const asked = await post({ step: 'identify', email: 'family@example.com' });
    expect(asked.status).toBe(409);
    expect(await asked.text()).toContain('name="bib"');
    const sent = await post({ step: 'identify', email: 'family@example.com', bib: '3003' });
    expect(await sent.text()).toContain('name="code"');
  });
});

describe('a demo race', () => {
  it('is its own race, open, pointing at the real one, with App Review’s runner on the shortest course', async () => {
    expect(demo).toMatchObject({ slug: 'democ-2026-demo', status: 'open', demoOf: source.id, name: source.name });
    const review = await db(env.DB).entrantByBib(demo.id, REVIEW_BIB);
    expect(review).toMatchObject({ email: REVIEW_EMAIL, distanceKey: 'half' });
  });
  it('is made once: pressing again keeps its id, its address and its runners', async () => {
    const again = await makeDemo(env, source, new Date('2027-01-01T00:00:00Z'));
    expect(again).toMatchObject({ ok: true, created: false, demo: { id: demo.id, slug: demo.slug, windowEnd: demo.windowEnd } });
    expect(await makeDemo(env, demo)).toEqual({ ok: false, error: 'is_demo' });
  });
  it('runs on the real race’s courses', async () => {
    expect((await db(env.DB).coursesForRace(demo.id)).map((c) => c.id)).toEqual([marathon.id, half.id]);
  });
  it('is not listed with the races, and its page is kept out of search engines', async () => {
    const { races } = (await (await SELF.fetch('http://run.test/api/races')).json()) as { races: Array<{ slug: string }> };
    expect(races.map((r) => r.slug)).toContain('democ-2026');
    expect(races.map((r) => r.slug)).not.toContain(demo.slug);
    expect(await (await SELF.fetch(`http://run.test/${demo.slug}`)).text()).toContain('<meta name="robots" content="noindex"/>');
  });

  it('lets App Review in with the review code, and nobody else', async () => {
    const review = { email: REVIEW_EMAIL };
    expect((await code(review)).status).toBe(200);
    expect((await verify({ ...review, code: '424242' })).status).toBe(200);
    // The review code opens a demo's test account only: not a real race's.
    expect((await code({ email: 'solo@example.com' })).status).toBe(200);
    expect((await verify({ email: 'solo@example.com', code: '424242' })).status).toBe(401);
  });

  it('keeps its runs out of the real race: results, dashboard, runner list', async () => {
    const token = await signIn({ email: REVIEW_EMAIL }, '424242');
    const me = (await (await SELF.fetch('http://run.test/api/me', { headers: { Authorization: `Bearer ${token}` } })).json()) as {
      entrant: { id: string };
      race: { slug: string; demoOf?: string };
      course: { id: string };
    };
    expect(me.race).toMatchObject({ slug: demo.slug, demoOf: source.id });
    expect(me.course.id).toBe(half.id);
    const startedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    const run = {
      id: 'democ-review-run',
      entrantId: me.entrant.id,
      courseId: half.id,
      status: 'finished',
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: 6_000_000,
      distanceM: half.distanceM + 20,
      splits: [],
      source: 'app',
    };
    const put = await SELF.fetch(`http://run.test/api/runs/${run.id}`, json({ run }, 'PUT', token));
    expect(put.status).toBe(200);
    const q = db(env.DB);
    expect((await q.resultsForCourse(demo.id, half.id)).map((r) => r.run.id)).toEqual(['democ-review-run']);
    expect(await q.resultsForCourse(source.id, half.id)).toEqual([]);
    const funnel = await dashboardDb(env.DB).funnel(source.id);
    expect(funnel.finished).toBe(0);
    const distances = await dashboardDb(env.DB).distances(demo.id);
    expect(distances.map((d) => [d.distanceKey, d.entrants, d.finished])).toEqual([
      ['marathon', 0, 0],
      ['half', 1, 1],
    ]);
    expect((await q.entrantsForRace(source.id)).map((e) => e.email)).not.toContain(REVIEW_EMAIL);
  });
  it('refuses a run on another race’s course', async () => {
    const token = await signIn({ email: REVIEW_EMAIL }, '424242');
    const me = (await (await SELF.fetch('http://run.test/api/me', { headers: { Authorization: `Bearer ${token}` } })).json()) as { entrant: { id: string } };
    const run = { id: 'democ-wrong', entrantId: me.entrant.id, courseId: 'democ-other-half', status: 'finished', elapsedMs: 1, distanceM: 1, splits: [], source: 'app' };
    expect((await SELF.fetch(`http://run.test/api/runs/${run.id}`, json({ run }, 'PUT', token))).status).toBe(400);
  });
});

describe('« Supprimer mes données »', () => {
  it('erases the runner’s runs, traces, cards and AI lines, and ends every session', async () => {
    const token = await signIn({ email: 'solo@example.com' });
    const other = await signIn({ email: 'solo@example.com' });
    const run = { id: 'democ-solo-run', entrantId: solo.id, courseId: half.id, status: 'finished', startedAt: new Date().toISOString(), elapsedMs: 60_000, distanceM: 200, splits: [], source: 'app' };
    const trace = { runId: run.id, samples: [], audioFired: [] };
    expect((await SELF.fetch(`http://run.test/api/runs/${run.id}`, json({ run, trace }, 'PUT', token))).status).toBe(200);
    await env.FILES.put(`cards/${run.id}-fr-og.png`, 'png');
    await env.FILES.put(`personal-texts/${half.id}/3/${solo.id}.json`, '{}');
    await env.FILES.put(`personal-texts/${half.id}/3/someone-else.json`, '{}');
    expect(await env.FILES.head(`traces/${source.id}/${run.id}.json`)).not.toBeNull();

    const res = await SELF.fetch('http://run.test/api/me', json(undefined, 'DELETE', token));
    expect(await res.json()).toEqual({ ok: true, runs: 1 });
    expect(await db(env.DB).runsForEntrant(solo.id)).toEqual([]);
    expect(await env.FILES.head(`traces/${source.id}/${run.id}.json`)).toBeNull();
    expect(await env.FILES.head(`cards/${run.id}-fr-og.png`)).toBeNull();
    expect(await env.FILES.head(`personal-texts/${half.id}/3/${solo.id}.json`)).toBeNull();
    expect(await env.FILES.head(`personal-texts/${half.id}/3/someone-else.json`)).not.toBeNull();
    expect((await SELF.fetch('http://run.test/api/me', { headers: { Authorization: `Bearer ${other}` } })).status).toBe(401);
    // The entry stays with the organizer: the runner can sign in again.
    expect(await db(env.DB).entrantById(solo.id)).not.toBeNull();
  });
});

describe('the staff demo card', () => {
  const org = (path: string, cookie: string, body?: Record<string, string>) =>
    SELF.fetch(`http://run.test/org${path}`, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie }, body: body ? new URLSearchParams(body) : undefined, redirect: 'manual' });
  const cookieFor = async (email: string) => {
    const res = await SELF.fetch('http://run.test/org/signin', { method: 'POST', body: new URLSearchParams({ step: 'code', email, code: env.TEST_CODE! }), redirect: 'manual' });
    return res.headers.get('set-cookie')!.split(';')[0]!;
  };
  it('shows staff the demo with App Review’s sign-in, and sends the demo’s courses page to the real race’s', async () => {
    const staff = await cookieFor('staff@example.com');
    const page = await (await org('/democ-2026/settings', staff)).text();
    expect(page).toContain(`href="/org/${demo.slug}"`);
    expect(page).toContain(REVIEW_EMAIL);
    const pressed = await org('/democ-2026/demo', staff, {});
    expect(pressed.headers.get('location')).toBe('/org/democ-2026/settings?done=demo#demo');
    expect((await org(`/${demo.slug}/courses`, staff)).headers.get('location')).toBe('/org/democ-2026/courses');
  });
  it('is staff only', async () => {
    await db(env.DB).upsertRace(source);
    await env.DB.prepare("INSERT OR IGNORE INTO organizers (id, race_id, email, role) VALUES ('democ-owner', ?, 'owner@example.com', 'owner')").bind(source.id).run();
    const owner = await cookieFor('owner@example.com');
    expect(await (await org('/democ-2026/settings', owner)).text()).not.toContain('id="demo"');
    expect((await org('/democ-2026/demo', owner, {})).headers.get('location')).toBe('/org/democ-2026?denied=1');
  });
});

describe('the privacy and install pages', () => {
  it('serves the privacy page in both languages, and /privacy in English', async () => {
    const fr = await SELF.fetch('http://run.test/confidentialite');
    expect(fr.status).toBe(200);
    expect(await fr.text()).toContain('Supprimer mes données');
    const en = await SELF.fetch('http://run.test/privacy', { redirect: 'manual' });
    expect(en.headers.get('location')).toBe('/confidentialite?lang=en');
    expect(await (await SELF.fetch('http://run.test/confidentialite?lang=en')).text()).toContain('Delete my data');
  });
  it('links it from every page footer', async () => {
    expect(await (await SELF.fetch('http://run.test/democ-2026')).text()).toContain('href="/confidentialite"');
  });
  it('says the app is coming when no store link is set yet', async () => {
    const post = (fields: Record<string, string>) => SELF.fetch('http://run.test/democ-2026/signin', { method: 'POST', body: new URLSearchParams(fields), redirect: 'manual' });
    await post({ step: 'identify', email: 'solo@example.com' });
    const signed = await post({ step: 'code', email: 'solo@example.com', code: env.TEST_CODE! });
    const cookie = signed.headers.get('set-cookie')!.split(';')[0]!;
    const page = await (await SELF.fetch('http://run.test/democ-2026/app', { headers: { Cookie: cookie } })).text();
    expect(page).toContain('L’app arrive avant l’ouverture de la course');
    expect(page).not.toContain('apps.apple.com');
  });
});
