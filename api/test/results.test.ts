import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { CourseSchema, EntrantSchema, RaceSchema, RunSchema, deauvilleMarathonGeometry } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { RETRY_AFTER_MS, cardKey, cardPng } from '../src/lib/cards';
import { rankOf, ranks } from '../src/lib/results';
import { deauvilleCourses, deauvilleRace } from '../src/seed/deauville';

// A race of its own, so the runs other suites upload never change a rank here. Its window is
// in 2099, so the pages that depend on today's date (the bib page until the window closes)
// read the same whenever the suite runs; `closed` is a race whose window is long over.
const race = RaceSchema.parse({ ...deauvilleRace, id: 'podium-2026', slug: 'podium-2026', windowStart: '2099-11-09T00:00:00+01:00', windowEnd: '2099-11-15T23:59:59+01:00' });
const closed = RaceSchema.parse({ ...deauvilleRace, id: 'closed-2020', slug: 'closed-2020', windowStart: '2020-11-09T00:00:00+01:00', windowEnd: '2020-11-15T23:59:59+01:00' });
const half = CourseSchema.parse({ ...deauvilleCourses[1], id: 'podium-2026-half', raceId: race.id });
const marathon = CourseSchema.parse({ ...deauvilleCourses[0], id: 'podium-2026-marathon', raceId: race.id });
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
  // The course file the cards draw: a race with none shows no course and gets no card.
  await env.FILES.put(half.geometryKey!, JSON.stringify(deauvilleMarathonGeometry));
  await q.upsertRace(race);
  await q.upsertCourse(half);
  await q.upsertCourse(marathon);
  await Promise.all([marc, lea, paul].map((e) => q.upsertEntrant(e)));
  await q.upsertRace(closed);
  await q.upsertCourse(CourseSchema.parse({ ...half, id: 'closed-2020-half', raceId: closed.id }));
  await q.upsertEntrant(EntrantSchema.parse({ ...paul, id: 'closed-3003', raceId: closed.id, bib: '3003' }));
  // Marc rehearsed fast in October, then ran race week slower: only the second one counts.
  await q.upsertRun(run('marc-rehearsal', marc.id, '2099-10-04T08:00:00.000Z', 5_400_000), null);
  await q.upsertRun(run('marc-race', marc.id, '2099-11-12T07:30:00.000Z', 6_300_000), null);
  // Léa: a slower finish during the week, and one started the minute the window closed.
  await q.upsertRun(run('lea-race', lea.id, '2099-11-09T00:00:00+01:00', 6_600_000), null);
  await q.upsertRun(run('lea-late', lea.id, '2099-11-16T00:00:00+01:00', 6_000_000), null);
  // Marc, entered in the half, also has a run on the marathon course (a re-import moved him, or
  // a tampered client): it must rank nowhere.
  await q.upsertRun({ ...run('marc-marathon', marc.id, '2099-11-13T07:30:00.000Z', 9_000_000), courseId: marathon.id, distanceM: marathon.distanceM }, null);
  // Paul stopped: nothing to rank.
  await q.upsertRun(run('paul-stop', paul.id, '2099-11-13T08:00:00.000Z', 1_200_000, 'abandoned'), null);
});

describe('the results table', () => {
  it('ranks only runs started during race week, best one per runner', async () => {
    const rows = await db(env.DB).resultsForCourse(half.id);
    expect(rows.map((r) => [r.entrant.bib, r.run.id])).toEqual([
      ['2001', 'marc-race'],
      ['2002', 'lea-race'],
    ]);
  });
  it('never ranks a run on another distance than the entrant’s own', async () => {
    expect(await db(env.DB).resultsForCourse(marathon.id)).toEqual([]);
  });
  it('gives equal times the same rank', () => {
    const rows = [1, 2, 2, 3].map((m) => ({ run: { elapsedMs: m * 60_000 } }));
    expect(ranks(rows)).toEqual([1, 2, 2, 4]);
    expect(rankOf(rows, 2 * 60_000)).toBe(2);
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
  it('is a bib page before the finish, inviting friends to run along', async () => {
    const res = await SELF.fetch(`${base}/results/2003`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Paul court Marathon International de Deauville.');
    expect(html).toContain('data-testid="bib-plate"');
    expect(html).toContain('Courez avec Paul');
    // Before a finish the page never spells out the whole name.
    expect(html).toContain('<meta property="og:title" content="Paul B. court Marathon International de Deauville."/>');
    expect(html).not.toContain('BERNARD');
  });
  it('says there is no time once the window has closed', async () => {
    const html = await (await SELF.fetch(`http://run.test/${closed.slug}/results/3003`)).text();
    expect(html).toContain('Pas de temps enregistré pour Paul.');
    expect(html).not.toContain('data-share=""');
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
  it('shows the bib on the card of someone who has not finished yet', async () => {
    const html = await (await SELF.fetch(`${base}/results/2003/card?format=og`)).text();
    expect(html).toContain('Dossard');
    expect(html).toContain('>2003<');
  });
  it('has no card once the window has closed without a finish', async () => {
    expect((await SELF.fetch(`http://run.test/${closed.slug}/results/3003/card`)).status).toBe(404);
  });
  it('names the card in its PNG URL, so an old picture is never served under a new result', async () => {
    const unversioned = await SELF.fetch(`${base}/results/2001/card.png?format=og`, { redirect: 'manual' });
    expect(unversioned.status).toBe(302);
    expect(unversioned.headers.get('location')).toBe(`${base}/results/2001/card.png?format=og&lang=fr&v=marc-race-fr`);
    // The bib card's URL, kept by a link shared before the finish, moves on to the finisher card.
    const stale = await SELF.fetch(`${base}/results/2001/card.png?format=og&v=bib-podium-2001-fr`, { redirect: 'manual' });
    expect(stale.headers.get('location')).toContain('v=marc-race-fr');
  });
  it('answers 404 for the PNG when this deployment renders no cards and has no map', async () => {
    expect((await SELF.fetch(`${base}/results/2001/card.png?format=og&v=marc-race-fr`)).status).toBe(404);
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
  it('does not hammer a failing renderer: one try per ten minutes', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('rate limited', { status: 429 });
    }) as unknown as typeof fetch;
    const deps = { files: env.FILES, accountId: 'acc', token: 'tok', fetchImpl };
    const now = Date.now();
    await cardPng(deps, 'busy-fr', 'og', 'https://run.test/card', now);
    await cardPng(deps, 'busy-fr', 'og', 'https://run.test/card', now + 60_000);
    expect(calls).toBe(1);
    await cardPng(deps, 'busy-fr', 'og', 'https://run.test/card', now + RETRY_AFTER_MS + 60_000);
    expect(calls).toBe(2);
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
    expect(html).toContain('<meta property="og:title" content="Marathon International de Deauville, où que vous soyez."/>');
    expect(html).toContain('Pas encore de dossard ?');
  });
});
