import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { OrganizerSchema, RaceSchema } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { adminDb } from '../src/db/adminQueries';
import { deauvilleCourses, deauvilleOrganizers, deauvilleRace } from '../src/seed/deauville';
import { sha256Hex } from '../src/lib/crypto';

const SLUG = 'deauville-2026';
const ORG = 'http://run.test/org';
const base = `${ORG}/${SLUG}`;

/** A second race with its own team, to prove one team cannot open another's admin. */
const otherRace = RaceSchema.parse({ ...deauvilleRace, id: 'other-2026', slug: 'other-2026', name: 'Autre course', theme: { ...deauvilleRace.theme, displayName: 'Autre course' } });

beforeAll(async () => {
  const q = db(env.DB);
  const a = adminDb(env.DB);
  await q.upsertRace(deauvilleRace);
  await q.upsertRace(otherRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all(deauvilleOrganizers.map((o) => a.upsertOrganizer(o)));
  await a.upsertOrganizer(OrganizerSchema.parse({ id: 'viewer', raceId: SLUG, email: 'lecture@example.com', role: 'viewer' }));
  await a.upsertOrganizer(OrganizerSchema.parse({ id: 'editor', raceId: SLUG, email: 'equipe@example.com', role: 'editor' }));
  await a.upsertOrganizer(OrganizerSchema.parse({ id: 'other', raceId: otherRace.id, email: 'autre@example.com', role: 'owner' }));
});

const post = (url: string, fields: Record<string, string>, cookie = '') =>
  SELF.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });
const get = (url: string, cookie = '') => SELF.fetch(url, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });

/** The last code issued for an email, read from the DB as the email would show it. */
const codeFor = async (email: string): Promise<string> => {
  const row = await env.DB.prepare('SELECT code_hash FROM admin_codes WHERE email = ? AND consumed_at IS NULL ORDER BY created_at DESC').bind(email).first<{ code_hash: string }>();
  for (let n = 0; n < 1_000_000; n++) {
    const code = String(n).padStart(6, '0');
    if ((await sha256Hex(code)) === row?.code_hash) return code;
  }
  throw new Error('code not found');
};

/** Email, then the code (the emailed one unless a test code is given). Returns the cookie and where it landed. */
const signIn = async (email: string, code?: string, next?: string): Promise<{ cookie: string; location: string }> => {
  const step1 = await post(`${ORG}/signin`, { step: 'identify', email, ...(next ? { next } : {}) });
  expect(step1.status).toBe(200);
  const html = await step1.text();
  expect(html).toContain('name="code"');
  const devCode = /name="code"[^>]*value="(\d{6})"/.exec(html)?.[1];
  const step2 = await post(`${ORG}/signin`, { step: 'code', email, code: code ?? devCode ?? (await codeFor(email)), ...(next ? { next } : {}) });
  expect(step2.status).toBe(302);
  return { cookie: step2.headers.get('set-cookie')!.split(';')[0]!, location: step2.headers.get('location')! };
};
/** A session in one post: test addresses need no issued code, and codes are capped at five an hour. */
const cookieFor = async (email: string): Promise<string> => {
  const res = await post(`${ORG}/signin`, { step: 'code', email, code: env.TEST_CODE! });
  expect(res.status).toBe(302);
  return res.headers.get('set-cookie')!.split(';')[0]!;
};

describe('organizer sign-in', () => {
  it('sends a signed-out visitor to the one sign-in page, remembering where they were going', async () => {
    const res = await get(`${base}/runners`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/org/signin?next=${encodeURIComponent(`/org/${SLUG}/runners`)}`);
    expect((await get(ORG)).headers.get('location')).toBe('/org/signin');
    // The first admin's per-race sign-in address still leads there.
    expect((await get(`${base}/signin`)).headers.get('location')).toBe(`/org/signin?next=${encodeURIComponent(`/org/${SLUG}`)}`);
  });
  it('gives no code to an address that is on no team, and says who to ask', async () => {
    const res = await post(`${ORG}/signin`, { step: 'identify', email: 'nobody@example.com' });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('Demandez au responsable');
  });
  it('signs in with the emailed code, lands on the only race, and signs out', async () => {
    const { cookie, location } = await signIn('arthur.flam@gmail.com');
    expect(cookie.startsWith('org_session=')).toBe(true);
    // Arthur is staff (STAFF_EMAILS): staff land on the list of every race, not on one.
    expect(location).toBe('/org');
    const list = await (await get(ORG, cookie)).text();
    expect(list).toContain('Autre course');
    expect(list).toContain('Nouvelle course');
    const home = await get(base, cookie);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('Pour être prêt');
    expect((await get(`${ORG}/signout`, cookie)).status).toBe(302);
    expect((await get(base, cookie)).status).toBe(302);
  });
  it('takes a member of one race straight to it, and back to the page they asked for', async () => {
    const cookie = await cookieFor('orga@example.com');
    expect((await get(ORG, cookie)).headers.get('location')).toBe(`/org/${SLUG}`);
    const deep = await signIn('orga@example.com', env.TEST_CODE, `/org/${SLUG}/runners`);
    expect(deep.location).toBe(`/org/${SLUG}/runners`);
    // Only admin paths are followed after sign-in.
    expect((await signIn('orga@example.com', env.TEST_CODE, 'https://evil.example.com/')).location).toBe('/org');
  });
  it('rejects a wrong code and lets the test code in only for test addresses', async () => {
    expect((await post(`${ORG}/signin`, { step: 'code', email: 'orga@example.com', code: '123456' })).status).toBe(401);
    expect((await post(`${ORG}/signin`, { step: 'code', email: 'arthur.flam@gmail.com', code: env.TEST_CODE! })).status).toBe(401);
  });
  it('does not let an organizer cookie open the runner pages', async () => {
    const cookie = await cookieFor('orga@example.com');
    const res = await get(`http://run.test/${SLUG}/app`, cookie.replace('org_session', 'sivoov_session'));
    expect(res.status).toBe(302);
  });
});

describe('sign-in codes', () => {
  it('count every attempt, even a burst of parallel guesses: five at most, then the code is dead', async () => {
    const hash = await sha256Hex('424242');
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    await adminDb(env.DB).createCode('burst-admin', 'orga@example.com', hash, expires);
    const claims = await Promise.all(Array.from({ length: 12 }, () => adminDb(env.DB).claimAttempt('burst-admin', 5)));
    expect(claims.filter(Boolean)).toHaveLength(5);
    expect((await post(`${ORG}/signin`, { step: 'code', email: 'orga@example.com', code: '424242' })).status).toBe(401);
    // Runner codes follow the same rule.
    await db(env.DB).upsertEntrant({ id: `${SLUG}-9901`, raceId: SLUG, bib: '9901', email: 'burst@example.com', firstName: 'B', lastName: 'U', distanceKey: 'half', source: 'manual' });
    await db(env.DB).createCode('burst-runner', `${SLUG}-9901`, hash, expires);
    const runnerClaims = await Promise.all(Array.from({ length: 12 }, () => db(env.DB).claimAttempt('burst-runner', 5)));
    expect(runnerClaims.filter(Boolean)).toHaveLength(5);
  });
  it('can be used once only', async () => {
    const hash = await sha256Hex('515151');
    await adminDb(env.DB).createCode('once-admin', 'equipe@example.com', hash, new Date(Date.now() + 15 * 60_000).toISOString());
    const [first, second] = await Promise.all([adminDb(env.DB).consumeCode('once-admin'), adminDb(env.DB).consumeCode('once-admin')]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});

describe('roles', () => {
  it('keeps one race’s team out of another race’s admin', async () => {
    const cookie = await cookieFor('autre@example.com');
    const res = await get(base, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/org?denied=1');
    expect((await get(`${ORG}/other-2026`, cookie)).status).toBe(200);
  });
  it('lets a read-only member look and download, but not import or open the settings', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const home = await (await get(base, cookie)).text();
    expect(home).toContain('Coureurs');
    expect(home).not.toContain('Réglages');
    expect(home).not.toContain('Importer des coureurs');
    expect((await get(`${base}/export/entrants.csv`, cookie)).status).toBe(200);
    expect((await get(`${base}/runners/import`, cookie)).headers.get('location')).toBe(`/org/${SLUG}?denied=1`);
    const fd = new FormData();
    fd.append('csv', 'dossard;email;prénom;nom;distance\n9001;x@example.com;X;Y;semi');
    const refused = await SELF.fetch(`${base}/runners/import`, { method: 'POST', headers: { Cookie: cookie }, body: fd, redirect: 'manual' });
    expect(refused.status).toBe(302);
    expect(await db(env.DB).entrantByBibEmail(SLUG, '9001', 'x@example.com')).toBeNull();
    expect((await get(`${base}/settings`, cookie)).status).toBe(302);
  });
  it('lets a team member import runners but not manage the team or the race settings', async () => {
    const cookie = await cookieFor('equipe@example.com');
    expect((await get(`${base}/runners/import`, cookie)).status).toBe(200);
    expect((await get(`${base}/team`, cookie)).status).toBe(302);
    expect((await get(`${base}/settings`, cookie)).status).toBe(302);
  });
  it('keeps staff pages for staff', async () => {
    const cookie = await cookieFor('orga@example.com');
    expect((await get(`${ORG}/new`, cookie)).headers.get('location')).toBe('/org?denied=1');
    const staff = await cookieFor('staff@example.com');
    expect((await get(`${ORG}/new`, staff)).status).toBe(200);
    expect((await get(`${base}/settings`, staff)).status).toBe(200);
  });
});

describe('import and export', () => {
  const csv = '﻿Dossard;Email;Prénom;Nom;Distance\r\n2001;anna@example.com;Anna;Roux;Semi\r\n2002;bob@example.com;Bob;Leroy;Marathon\r\nx;bad;;;10k\r\n';
  const send = (cookie: string, body: FormData) => SELF.fetch(`${base}/runners/import`, { method: 'POST', headers: { Cookie: cookie }, body, redirect: 'manual' });

  it('imports a multipart file idempotently and reports the outcome', async () => {
    const cookie = await cookieFor('orga@example.com');
    const fd = new FormData();
    fd.append('file', new File([csv], 'inscrits.csv', { type: 'text/csv' }));
    // Sending the file shows what it would do; confirming writes it.
    const preview = await (await send(cookie, fd)).text();
    expect(preview).toContain('2 nouveaux coureurs, 0 mis à jour, 1 ligne refusée.');
    expect(preview).toContain('Ligne 4');
    const first = new FormData();
    first.append('step', 'confirm');
    first.append('csv', csv);
    expect((await send(cookie, first)).headers.get('location')).toBe(`/org/${SLUG}/runners?done=imported&added=2&updated=0&refused=1`);
    const again = new FormData();
    again.append('step', 'confirm');
    again.append('csv', csv.replace('Anna;Roux', 'Anna;Durand'));
    // Only Anna changed: Bob is already up to date.
    expect((await send(cookie, again)).headers.get('location')).toBe(`/org/${SLUG}/runners?done=imported&added=0&updated=1&refused=1`);
    const stored = await db(env.DB).entrantByBibEmail(SLUG, '2001', 'anna@example.com');
    expect(stored?.lastName).toBe('Durand');
    expect(stored?.id).toBe(`${SLUG}-2001`);
    const list = await (await get(`${base}/runners?q=dur`, cookie)).text();
    expect(list).toContain('DURAND');
    expect(list).not.toContain('LEROY');
    // The first admin's import address still works.
    expect((await get(`${base}/import`, cookie)).headers.get('location')).toBe(`/org/${SLUG}/runners/import`);
  });
  it('exports runners and results as semicolon CSV with French headers', async () => {
    const cookie = await cookieFor('orga@example.com');
    await db(env.DB).upsertRun(
      { id: 'run-org-1', entrantId: `${SLUG}-2002`, courseId: `${SLUG}-marathon`, status: 'finished', source: 'app', startedAt: '2026-11-10T09:00:00+01:00', finishedAt: '2026-11-10T12:30:00+01:00', elapsedMs: 12_600_000, distanceM: 42195, splits: [] },
      null,
    );
    const entrants = await get(`${base}/export/entrants.csv`, cookie);
    expect(entrants.headers.get('content-type')).toContain('text/csv');
    const entrantsCsv = await entrants.text();
    expect(entrantsCsv).toContain('Dossard;Prénom;Nom;Email;Distance;Adresse;Complément;Code postal;Ville;Pays;Connecté;Dans l’application;Meilleur temps');
    expect(entrantsCsv).toContain('2002;Bob;Leroy;bob@example.com;Marathon;;;;;;Non;Non;3:30:00');
    const results = await (await get(`${base}/export/results.csv`, cookie)).text();
    expect(results).toContain('2002;Bob;Leroy;Marathon;3:30:00;12600;42195;Arrivé;2026-11-10 12:30');
    expect(results).toContain('2001;Anna;Durand;Semi-marathon;;;;Pas encore couru;');
    expect((await get(`${base}/export/results.csv`)).status).toBe(302);
  });
  it('counts the finish on the home page and shows it in the latest activities', async () => {
    const cookie = await cookieFor('orga@example.com');
    const home = await (await get(base, cookie)).text();
    expect(home).toContain('LEROY');
    expect(home).toContain('3:30:00');
    expect(home).toContain('Arrivé');
  });
  it('never exports a rehearsal as a finish, since the results file decides who gets a medal', async () => {
    const cookie = await cookieFor('orga@example.com');
    await db(env.DB).upsertRun(
      { id: 'run-org-rehearsal', entrantId: `${SLUG}-2001`, courseId: `${SLUG}-half`, status: 'finished', source: 'app', startedAt: '2026-10-18T09:00:00+02:00', finishedAt: '2026-10-18T10:40:00+02:00', elapsedMs: 6_000_000, distanceM: 21097.5, splits: [] },
      null,
    );
    const results = await (await get(`${base}/export/results.csv`, cookie)).text();
    expect(results).toContain('2001;Anna;Durand;Semi-marathon;1:40:00;6000;21098;Hors classement;');
    const entrants = await (await get(`${base}/export/entrants.csv`, cookie)).text();
    // No best time: the rehearsal is nobody's official finish.
    expect(entrants).toMatch(/^2001;Anna;Durand;.*;$/m);
  });
});
