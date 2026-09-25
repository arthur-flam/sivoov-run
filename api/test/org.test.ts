import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/queries';
import { orgDb } from '../src/db/orgQueries';
import { deauvilleCourses, deauvilleOrganizers, deauvilleRace } from '../src/seed/deauville';
import { sha256Hex } from '../src/lib/crypto';

const SLUG = 'deauville-2026';
const base = `http://run.test/org/${SLUG}`;

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all(deauvilleOrganizers.map((o) => orgDb(env.DB).upsertOrganizer(o)));
});

const form = (path: string, fields: Record<string, string>, cookie = '') =>
  SELF.fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });

/** The last code issued for an organizer, read from the DB as the email would show it. */
const codeFor = async (organizerId: string): Promise<string> => {
  const row = await env.DB.prepare('SELECT code_hash FROM organizer_codes WHERE organizer_id = ? AND consumed_at IS NULL ORDER BY created_at DESC').bind(organizerId).first<{ code_hash: string }>();
  for (let n = 0; n < 1_000_000; n++) {
    const code = String(n).padStart(6, '0');
    if ((await sha256Hex(code)) === row?.code_hash) return code;
  }
  throw new Error('code not found');
};

const signIn = async (email: string, code?: string): Promise<string> => {
  const step1 = await form('/signin', { step: 'identify', email });
  expect(step1.status).toBe(200);
  const html = await step1.text();
  expect(html).toContain('name="code"');
  const devCode = /name="code"[^>]*value="(\d{6})"/.exec(html)?.[1];
  const organizer = deauvilleOrganizers.find((o) => o.email === email)!;
  const step2 = await form('/signin', { step: 'code', email, code: code ?? devCode ?? (await codeFor(organizer.id)) });
  expect(step2.status).toBe(302);
  expect(step2.headers.get('location')).toBe(`/org/${SLUG}`);
  return step2.headers.get('set-cookie')!.split(';')[0]!;
};

describe('organizer sign-in', () => {
  it('redirects the admin to sign-in without a session and refuses unknown emails', async () => {
    const res = await SELF.fetch(base, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/org/${SLUG}/signin`);
    const unknown = await form('/signin', { step: 'identify', email: 'nobody@example.com' });
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toContain('n’est pas organisateur');
    expect((await SELF.fetch('http://run.test/org/nope/signin')).status).toBe(404);
  });
  it('signs in with the emailed code and shows the admin home', async () => {
    const cookie = await signIn('arthur.flam@gmail.com');
    expect(cookie.startsWith('org_session=')).toBe(true);
    const home = await SELF.fetch(base, { headers: { Cookie: cookie } });
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain('Espace organisateur');
    expect(html).toContain('arthur.flam@gmail.com');
    const out = await SELF.fetch(`${base}/signout`, { headers: { Cookie: cookie }, redirect: 'manual' });
    expect(out.status).toBe(302);
    expect((await SELF.fetch(base, { headers: { Cookie: cookie }, redirect: 'manual' })).status).toBe(302);
  });
  it('accepts TEST_CODE for the @example.com organizer and rejects a wrong code', async () => {
    const wrong = await form('/signin', { step: 'code', email: 'orga@example.com', code: '123456' });
    expect(wrong.status).toBe(401);
    const cookie = await signIn('orga@example.com', env.TEST_CODE);
    expect((await SELF.fetch(base, { headers: { Cookie: cookie } })).status).toBe(200);
  });
  it('does not let an organizer cookie open the runner pages', async () => {
    const cookie = await signIn('orga@example.com', env.TEST_CODE);
    const res = await SELF.fetch(`http://run.test/${SLUG}/app`, { headers: { Cookie: cookie.replace('org_session', 'sivoov_session') }, redirect: 'manual' });
    expect(res.status).toBe(302);
  });
});

describe('import and export', () => {
  const csv = '\uFEFFDossard;Email;Prénom;Nom;Distance\r\n2001;anna@example.com;Anna;Roux;Semi\r\n2002;bob@example.com;Bob;Leroy;Marathon\r\nx;bad;;;10k\r\n';
  const post = (cookie: string, body: FormData) => SELF.fetch(`${base}/import`, { method: 'POST', headers: { Cookie: cookie }, body });

  it('imports a multipart file idempotently and reports the outcome', async () => {
    const cookie = await signIn('orga@example.com', env.TEST_CODE);
    const fd = new FormData();
    fd.append('file', new File([csv], 'inscrits.csv', { type: 'text/csv' }));
    const first = await (await post(cookie, fd)).text();
    expect(first).toContain('2 ajoutés, 0 mis à jour, 1 rejetés');
    expect(first).toContain('ligne 4');
    const again = new FormData();
    again.append('csv', csv.replace('Anna;Roux', 'Anna;Durand'));
    const second = await (await post(cookie, again)).text();
    expect(second).toContain('0 ajoutés, 2 mis à jour, 1 rejetés');
    const stored = await db(env.DB).entrantByBibEmail(SLUG, '2001', 'anna@example.com');
    expect(stored?.lastName).toBe('Durand');
    expect(stored?.id).toBe(`${SLUG}-2001`);
    const home = await (await SELF.fetch(`${base}?q=dur`, { headers: { Cookie: cookie } })).text();
    expect(home).toContain('DURAND');
    expect(home).not.toContain('LEROY');
  });
  it('exports entrants and results as semicolon CSV', async () => {
    const cookie = await signIn('orga@example.com', env.TEST_CODE);
    await db(env.DB).upsertRun(
      { id: 'run-org-1', entrantId: `${SLUG}-2002`, courseId: `${SLUG}-marathon`, status: 'finished', source: 'app', startedAt: '2026-11-10T09:00:00+01:00', finishedAt: '2026-11-10T12:30:00+01:00', elapsedMs: 12_600_000, distanceM: 42195, splits: [] },
      null,
    );
    const entrants = await SELF.fetch(`${base}/export/entrants.csv`, { headers: { Cookie: cookie } });
    expect(entrants.headers.get('content-type')).toContain('text/csv');
    const entrantsCsv = await entrants.text();
    expect(entrantsCsv).toContain('bib;email;first_name;last_name;distance_key;best_time');
    expect(entrantsCsv).toContain('2002;bob@example.com;Bob;Leroy;marathon;3:30:00');
    const results = await (await SELF.fetch(`${base}/export/results.csv`, { headers: { Cookie: cookie } })).text();
    expect(results).toContain('2002;Bob LEROY;marathon;3:30:00;12600000;42195;finished;2026-11-10T12:30:00+01:00');
    expect(results).toContain('2001;Anna DURAND;half;;;;not_started;');
    expect((await SELF.fetch(`${base}/export/results.csv`, { redirect: 'manual' })).status).toBe(302);
  });
  it('never exports a rehearsal as a finish, since the results file decides who gets a medal', async () => {
    const cookie = await signIn('orga@example.com', env.TEST_CODE);
    await db(env.DB).upsertRun(
      { id: 'run-org-rehearsal', entrantId: `${SLUG}-2001`, courseId: `${SLUG}-half`, status: 'finished', source: 'app', startedAt: '2026-10-18T09:00:00+02:00', finishedAt: '2026-10-18T10:40:00+02:00', elapsedMs: 6_000_000, distanceM: 21097.5, splits: [] },
      null,
    );
    const results = await (await SELF.fetch(`${base}/export/results.csv`, { headers: { Cookie: cookie } })).text();
    expect(results).toContain('2001;Anna DURAND;half;1:40:00;6000000;21098;outside_window;');
    const entrants = await (await SELF.fetch(`${base}/export/entrants.csv`, { headers: { Cookie: cookie } })).text();
    expect(entrants).toMatch(/^2001;[^;]*;Anna;Durand;half;$/m);
  });
});
