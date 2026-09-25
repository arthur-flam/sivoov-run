import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { CourseSchema, EntrantSchema, RaceSchema, RunSchema } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { cardKey, cardPng } from '../src/lib/cards';
import { deauvilleCourses, deauvilleRace } from '../src/seed/deauville';

// A race of its own, so the runs other suites upload never change a rank here.
const race = RaceSchema.parse({ ...deauvilleRace, id: 'podium-2026', slug: 'podium-2026' });
const half = CourseSchema.parse({ ...deauvilleCourses[1], id: 'podium-2026-half', raceId: race.id });
const entrant = (bib: string, firstName: string, lastName: string) =>
  EntrantSchema.parse({ id: `podium-${bib}`, raceId: race.id, bib, email: `runner${bib}@example.com`, firstName, lastName, distanceKey: 'half', source: 'manual' });
const marc = entrant('2001', 'Marc', 'Dupont');
const lea = entrant('2002', 'Léa', 'Martin');
const paul = entrant('2003', 'Paul', 'Bernard');

const run = (id: string, entrantId: string, startedAt: string, elapsedMs: number, status: 'finished' | 'abandoned' = 'finished') =>
  RunSchema.parse({ id, entrantId, courseId: half.id, status, source: 'app', startedAt, finishedAt: startedAt, elapsedMs, distanceM: half.distanceM, splits: [{ km: 1, elapsedMs: 300_000, splitMs: 300_000 }] });

const base = `http://run.test/${race.slug}`;

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(race);
  await q.upsertCourse(half);
  await Promise.all([marc, lea, paul].map((e) => q.upsertEntrant(e)));
  // Marc rehearsed fast in October, then ran race week slower: only the second one counts.
  await q.upsertRun(run('marc-rehearsal', marc.id, '2026-10-04T08:00:00.000Z', 5_400_000), null);
  await q.upsertRun(run('marc-race', marc.id, '2026-11-12T07:30:00.000Z', 6_300_000), null);
  // Léa: a slower finish during the week, and one started the minute the window closed.
  await q.upsertRun(run('lea-race', lea.id, '2026-11-09T00:00:00+01:00', 6_600_000), null);
  await q.upsertRun(run('lea-late', lea.id, '2026-11-16T00:00:00+01:00', 6_000_000), null);
  // Paul stopped: nothing to rank.
  await q.upsertRun(run('paul-stop', paul.id, '2026-11-13T08:00:00.000Z', 1_200_000, 'abandoned'), null);
});

describe('the results table', () => {
  it('ranks only runs started during race week, best one per runner', async () => {
    const rows = await db(env.DB).resultsForCourse(half.id);
    expect(rows.map((r) => [r.entrant.bib, r.run.id])).toEqual([
      ['2001', 'marc-race'],
      ['2002', 'lea-race'],
    ]);
  });
  it('links every runner to their certificate', async () => {
    const html = await (await SELF.fetch(`${base}/results?distance=half`)).text();
    expect(html).toContain(`href="/${race.slug}/results/2001"`);
    expect(html).not.toContain('1:30:00');
  });
});

describe('a finisher’s certificate', () => {
  it('shows the official time, the rank and the pace', async () => {
    const res = await SELF.fetch(`${base}/results/2001`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Marc <span>DUPONT</span>');
    expect(html).toContain('1:45:00');
    expect(html).toContain('1er sur 2');
    // 6 300 s over 21.0975 km.
    expect(html).toContain('4:59 /km');
  });
  it('previews in a shared link with the runner’s name and time', async () => {
    const html = await (await SELF.fetch(`${base}/results/2001`)).text();
    expect(html).toContain('<meta property="og:title" content="Marc DUPONT · 1:45:00 · Marathon International de Deauville"/>');
    expect(html).toContain(`<meta property="og:url" content="${base}/results/2001"/>`);
  });
  it('speaks English when asked, ordinals included', async () => {
    const html = await (await SELF.fetch(`${base}/results/2002?lang=en`)).text();
    expect(html).toContain('2nd of 2');
    expect(html).toContain('crossed the finish line of');
  });
  it('turns every visitor toward the race', async () => {
    const html = await (await SELF.fetch(`${base}/results/2002`)).text();
    expect(html).toContain('Courez Marathon International de Deauville, vous aussi.');
    expect(html).toContain(`href="/${race.slug}"`);
  });
  it('says plainly when the runner has not finished yet', async () => {
    const res = await SELF.fetch(`${base}/results/2003`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Paul n’a pas encore franchi la ligne.');
  });
  it('404s a bib that is not in the race', async () => {
    expect((await SELF.fetch(`${base}/results/9999`)).status).toBe(404);
  });
});

describe('share cards', () => {
  it('lays the finisher card out as a page Browser Rendering can photograph', async () => {
    const res = await SELF.fetch(`${base}/results/2001/card?format=story`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<body class="story"');
    expect(html).toContain('Marc DUPONT');
    expect(html).toContain('1:45:00');
  });
  it('has no card for someone who has not finished', async () => {
    expect((await SELF.fetch(`${base}/results/2003/card`)).status).toBe(404);
  });
  it('answers 404 for the PNG when this deployment renders no cards', async () => {
    expect((await SELF.fetch(`${base}/results/2001/card.png`)).status).toBe(404);
  });

  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  it('photographs a card once and serves it from R2 after that', async () => {
    const calls: Array<{ url: string; body: { url: string; viewport: { width: number } } }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(pngBytes, { headers: { 'Content-Type': 'image/png' } });
    }) as typeof fetch;
    const deps = { files: env.FILES, accountId: 'acc', token: 'tok', fetchImpl };
    const first = await cardPng(deps, 'marc-race-fr', 'og', 'https://run.test/card');
    const second = await cardPng(deps, 'marc-race-fr', 'og', 'https://run.test/card');
    expect(new Uint8Array(first!)).toEqual(pngBytes);
    expect(new Uint8Array(second!)).toEqual(pngBytes);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/browser-rendering/screenshot');
    expect(calls[0]!.body).toMatchObject({ url: 'https://run.test/card', viewport: { width: 1200 } });
  });
  it('keeps nothing when the renderer fails, so the next request tries again', async () => {
    const fetchImpl = (async () => Response.json({ success: false }, { status: 401 })) as unknown as typeof fetch;
    expect(await cardPng({ files: env.FILES, accountId: 'acc', token: 'bad', fetchImpl }, 'lea-race-fr', 'story', 'https://run.test/card')).toBeNull();
    expect(await env.FILES.head(cardKey('lea-race-fr', 'story'))).toBeNull();
  });
  it('never calls the renderer without a token', async () => {
    const fetchImpl = (async () => {
      throw new Error('must not be called');
    }) as unknown as typeof fetch;
    expect(await cardPng({ files: env.FILES, accountId: 'acc', fetchImpl }, 'paul-fr', 'og', 'https://run.test/card')).toBeNull();
  });
});

describe('the landing page as a shared link', () => {
  it('previews with the race’s promise, and shows a way in for people with no bib yet', async () => {
    const html = await (await SELF.fetch(base)).text();
    expect(html).toContain('<meta property="og:title" content="Courez Marathon International de Deauville où que vous soyez."/>');
    expect(html).toContain('Pas encore de dossard ?');
  });
});
