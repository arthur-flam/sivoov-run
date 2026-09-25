import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { CourseSchema, EntrantSchema, OrganizerSchema, RaceSchema, parseEntrantsCsv } from '@sivoov/shared';
import type { Entrant, Run } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { adminDb } from '../src/db/adminQueries';
import { instructionsLog } from '../src/db/runnerQueries';
import { deauvilleCourses, deauvilleRace } from '../src/seed/deauville';
import { sha256Hex } from '../src/lib/crypto';
import { instructionsEmail } from '../src/pages/emails';

/**
 * The organizer's runner screens (list, one runner, add, edit, delete, import, downloads) and
 * how the Worker learns who reached the app. A race of its own, so the counts are this file's.
 */
const SLUG = 'runners-2026';
const ORG = 'http://run.test/org';
const base = `${ORG}/${SLUG}`;
const race = RaceSchema.parse({ ...deauvilleRace, id: SLUG, slug: SLUG, name: 'Course des coureurs', theme: { ...deauvilleRace.theme, displayName: 'Course des coureurs' } });
const courses = deauvilleCourses.map((c) => CourseSchema.parse({ ...c, id: `${SLUG}-${c.distanceKey}`, raceId: SLUG }));
const courseId = (key: 'marathon' | 'half') => `${SLUG}-${key}`;

const entrant = (bib: string, firstName: string, lastName: string, distanceKey: 'marathon' | 'half', extra: Partial<Entrant> = {}): Entrant =>
  EntrantSchema.parse({ id: `${SLUG}-${bib}`, raceId: SLUG, bib, email: `${firstName.toLowerCase()}@example.com`, firstName, lastName, distanceKey, source: 'import', ...extra });

/**
 * Who is who: Anna never signed in, Bruno only on the web, Chloé and Denis in the app, Denis
 * ran without finishing, Chloé finished, Emma finished a marathon from the web and gave her address.
 */
const people = {
  anna: entrant('1', 'Anna', 'Arnaud', 'half'),
  bruno: entrant('2', 'Bruno', 'Blanc', 'half'),
  chloe: entrant('3', 'Chloe', 'Colin', 'marathon'),
  denis: entrant('4', 'Denis', 'Dumas', 'marathon'),
  emma: entrant('5', 'Emma', 'Eluard', 'marathon', { address: { line1: '12 rue des Planches', postalCode: '14800', city: 'Deauville', country: 'FR' } }),
};

const run = (id: string, who: Entrant, over: Partial<Run>): Run => ({
  id, entrantId: who.id, courseId: courseId(who.distanceKey as 'marathon' | 'half'), status: 'finished', source: 'app',
  startedAt: '2026-11-10T09:00:00+01:00', finishedAt: '2026-11-10T12:00:00+01:00', elapsedMs: 10_800_000, distanceM: 42_300, splits: [], ...over,
});

const session = (who: Entrant, client: 'web' | 'app', device?: string) =>
  env.DB.prepare('INSERT INTO sessions (id, entrant_id, token_hash, expires_at, client, device, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(`s-${who.bib}-${client}`, who.id, `hash-${who.bib}-${client}`, '2099-01-01T00:00:00.000Z', client, device ?? null, new Date().toISOString())
    .run();

beforeAll(async () => {
  const q = db(env.DB);
  const a = adminDb(env.DB);
  await q.upsertRace(race);
  await Promise.all(courses.map((c) => q.upsertCourse(c)));
  await Promise.all(Object.values(people).map((e) => q.upsertEntrant(e)));
  await Promise.all(
    [['owner', 'orga@example.com'], ['editor', 'equipe@example.com'], ['viewer', 'lecture@example.com']].map(([role, email]) =>
      a.upsertOrganizer(OrganizerSchema.parse({ id: `${SLUG}-${role}`, raceId: SLUG, email, role })),
    ),
  );
  await session(people.bruno, 'web');
  await session(people.chloe, 'app', JSON.stringify({ platform: 'android', osVersion: '16', model: 'samsung SM-S911B', appVersion: '2.0.0' }));
  await session(people.chloe, 'web');
  await session(people.denis, 'app');
  await session(people.emma, 'web');
  await q.upsertRun(run('r-chloe', people.chloe, { elapsedMs: 12_600_000 }), null);
  await q.upsertRun(run('r-denis', people.denis, { status: 'abandoned', elapsedMs: 3_000_000, distanceM: 9_000 }), null);
  await q.upsertRun(run('r-denis-sim', people.denis, { source: 'simulation', status: 'abandoned' }), null);
  await q.upsertRun(run('r-emma', people.emma, { source: 'upload', status: 'uploaded', elapsedMs: 13_000_000 }), null);
});

const post = (url: string, fields: Record<string, string>, cookie: string) =>
  SELF.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie }, body: new URLSearchParams(fields).toString(), redirect: 'manual' });
const postForm = (url: string, body: FormData, cookie: string) => SELF.fetch(url, { method: 'POST', headers: { Cookie: cookie }, body, redirect: 'manual' });
const get = (url: string, cookie: string) => SELF.fetch(url, { headers: { Cookie: cookie }, redirect: 'manual' });
const cookieFor = async (email: string): Promise<string> => {
  const res = await post(`${ORG}/signin`, { step: 'code', email, code: env.TEST_CODE! }, '');
  expect(res.status).toBe(302);
  return res.headers.get('set-cookie')!.split(';')[0]!;
};

/** The count shown on each chip of the list, by filter. */
const chipCounts = (html: string): Record<string, number> =>
  Object.fromEntries(
    [...html.matchAll(/<a href="\/org\/[^"]*\/runners(?:\?([^"]*))?"[^>]*>[^<]*<span class="n">(\d+)<\/span>/g)].map(([, qs = '', n]) => [
      new URLSearchParams(qs.replaceAll('&amp;', '&')).get('filter') ?? 'all',
      Number(n),
    ]),
  );
/** The names in the list's table, in order. */
const listed = (html: string): string[] => [...html.matchAll(/class="row-link"[^>]*>([^<]+)</g)].map(([, name = '']) => name.trim().split(' ')[0]!);
const unescape = (s: string) => s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
const stored = (bib: string) => env.DB.prepare('SELECT * FROM entrants WHERE race_id = ? AND bib = ?').bind(SLUG, bib).first<Record<string, string | null>>();

describe('the runner list', () => {
  it('counts who signed in, who reached the app, who ran and who finished', async () => {
    const cookie = await cookieFor('orga@example.com');
    const html = await (await get(`${base}/runners`, cookie)).text();
    expect(chipCounts(html)).toEqual({ all: 5, not_signed_in: 1, signed_in: 4, app: 2, ran: 3, finished: 2 });
    expect(listed(html)).toEqual(['Anna', 'Bruno', 'Chloe', 'Denis', 'Emma']);
    // The app badge, the phone's platform, and the best official time.
    expect(html).toContain('Web seulement');
    expect(html).toContain('Android');
    expect(html).toContain('3:30:00');
  });

  it('shows the people behind each chip, and keeps counting under a distance and a search', async () => {
    const cookie = await cookieFor('orga@example.com');
    const names = async (qs: string) => listed(await (await get(`${base}/runners?${qs}`, cookie)).text());
    expect(await names('filter=not_signed_in')).toEqual(['Anna']);
    expect(await names('filter=signed_in')).toEqual(['Bruno', 'Chloe', 'Denis', 'Emma']);
    expect(await names('filter=app')).toEqual(['Chloe', 'Denis']);
    // Denis's simulated run does not make him a finisher; his real one makes him a starter.
    expect(await names('filter=ran')).toEqual(['Chloe', 'Denis', 'Emma']);
    expect(await names('filter=finished')).toEqual(['Chloe', 'Emma']);
    expect(await names('distance=half')).toEqual(['Anna', 'Bruno']);
    const marathonApp = await (await get(`${base}/runners?distance=marathon&filter=app`, cookie)).text();
    expect(chipCounts(marathonApp)).toEqual({ all: 3, not_signed_in: 0, signed_in: 3, app: 2, ran: 3, finished: 2 });
    expect(await names('q=colin')).toEqual(['Chloe']);
    expect(await names('q=5')).toEqual(['Emma']);
    expect(await names('filter=nonsense&distance=ultra')).toEqual(['Anna', 'Bruno', 'Chloe', 'Denis', 'Emma']);
  });

  it('downloads the list as it is filtered, with French headers Excel opens', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const res = await get(`${base}/export/entrants.csv?filter=not_signed_in`, cookie);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv.split('\r\n').filter(Boolean)).toEqual([
      'Dossard;Prénom;Nom;Email;Distance;Adresse;Complément;Code postal;Ville;Pays;Connecté;Dans l’application;Meilleur temps',
      '1;Anna;Arnaud;anna@example.com;Semi-marathon;;;;;;Non;Non;',
    ]);
    // What the list exports, the import reads back.
    const all = await (await get(`${base}/export/entrants.csv`, cookie)).text();
    const again = parseEntrantsCsv(all, { distances: ['marathon', 'half'] });
    expect(again.rejected).toEqual([]);
    expect(again.entrants.find((e) => e.bib === '5')).toEqual({ bib: '5', email: 'emma@example.com', firstName: 'Emma', lastName: 'Eluard', distanceKey: 'marathon', address: people.emma.address });
  });
});

describe('one runner', () => {
  it('says where they are with the app, on which phone, and lists their runs', async () => {
    const cookie = await cookieFor('orga@example.com');
    const html = await (await get(`${base}/runners/3`, cookie)).text();
    expect(html).toContain('Chloe COLIN');
    expect(html).toContain('Connecté dans l’application');
    expect(html).toContain('Android 16 · samsung SM-S911B');
    expect(html).toContain('2.0.0');
    expect(html).toContain(`/org/${SLUG}/runs/r-chloe`);
    expect(html).toContain('3:30:00');
    expect(html).toContain('Arrivé');
    const anna = await (await get(`${base}/runners/1`, cookie)).text();
    expect(anna).toContain('Pas encore connecté');
    expect(anna).toContain('Pas encore d’activité');
    expect((await get(`${base}/runners/999`, cookie)).status).toBe(404);
  });

  it('validates an edit, keeps what was typed, then saves it with the medal address', async () => {
    const cookie = await cookieFor('equipe@example.com');
    const fields = { firstName: 'Anna', lastName: 'Arnaud-Roy', email: 'anna@', distanceKey: 'half', line1: '3 quai', line2: '', postalCode: '', city: 'Caen', country: 'France' };
    const refused = await post(`${base}/runners/1/edit`, fields, cookie);
    expect(refused.status).toBe(400);
    const page = await refused.text();
    expect(page).toContain('Cet email n’est pas valide');
    expect(page).toContain('Indiquez le code postal');
    expect(page).toContain('value="Arnaud-Roy"');
    expect((await stored('1'))?.last_name).toBe('Arnaud');

    const saved = await post(`${base}/runners/1/edit`, { ...fields, email: 'Anna.Roy@example.com', postalCode: '14000', bib: '999' }, cookie);
    expect(saved.status).toBe(302);
    expect(saved.headers.get('location')).toBe(`/org/${SLUG}/runners/1?done=saved`);
    const row = await stored('1');
    expect(row).toMatchObject({ bib: '1', last_name: 'Arnaud-Roy', email: 'anna.roy@example.com' });
    expect(JSON.parse(row!.address!)).toEqual({ line1: '3 quai', postalCode: '14000', city: 'Caen', country: 'FR' });
    expect(await (await get(`${base}/runners/1?done=saved`, cookie)).text()).toContain('Modifications enregistrées');
  });

  it('lets a read-only member look, but not edit, email or delete', async () => {
    const cookie = await cookieFor('lecture@example.com');
    const page = await (await get(`${base}/runners/2`, cookie)).text();
    expect(page).not.toContain('/runners/2/edit');
    expect(page).not.toContain('Envoyer les instructions');
    expect(page).not.toContain('Supprimer');
    expect((await get(`${base}/runners/2/edit`, cookie)).headers.get('location')).toBe(`/org/${SLUG}?denied=1`);
    expect((await post(`${base}/runners/2/edit`, { firstName: 'X', lastName: 'Y', email: 'x@example.com', distanceKey: 'half' }, cookie)).status).toBe(302);
    expect((await post(`${base}/runners/2/delete`, {}, cookie)).headers.get('location')).toBe(`/org/${SLUG}?denied=1`);
    expect((await post(`${base}/runners/2/instructions`, {}, cookie)).headers.get('location')).toBe(`/org/${SLUG}?denied=1`);
    expect((await get(`${base}/runners/new`, cookie)).status).toBe(302);
    expect((await stored('2'))?.first_name).toBe('Bruno');
  });

  it('refuses to delete a runner who has run, and deletes one who has not, sessions included', async () => {
    const cookie = await cookieFor('orga@example.com');
    const refused = await post(`${base}/runners/3/delete`, {}, cookie);
    expect(refused.headers.get('location')).toBe(`/org/${SLUG}/runners/3?done=has_runs`);
    expect(await stored('3')).not.toBeNull();
    await db(env.DB).upsertEntrant(entrant('90', 'Zoe', 'Zola', 'half'));
    await session(entrant('90', 'Zoe', 'Zola', 'half'), 'web');
    const deleted = await post(`${base}/runners/90/delete`, {}, cookie);
    expect(deleted.headers.get('location')).toBe(`/org/${SLUG}/runners?done=deleted`);
    expect(await stored('90')).toBeNull();
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE entrant_id = ?').bind(`${SLUG}-90`).first('n')).toBe(0);
  });

  it('emails the instructions, at most three times a day', async () => {
    const cookie = await cookieFor('orga@example.com');
    const send = () => post(`${base}/runners/4/instructions`, {}, cookie);
    const responses = [await send(), await send(), await send(), await send()];
    expect(responses.map((r) => r.headers.get('location'))).toEqual([...Array(3).fill(`/org/${SLUG}/runners/4?done=instructions_sent`), `/org/${SLUG}/runners/4?done=instructions_limit`]);
    const sent = await instructionsLog(env.FILES).list(`${SLUG}-4`);
    expect(sent).toHaveLength(3);
    expect(sent[0]?.by).toBe('orga@example.com');
    const page = await (await get(`${base}/runners/4?done=instructions_limit`, cookie)).text();
    expect(page).toContain('Réessayez demain');
    expect(page).toContain('par orga@example.com');
  });
});

describe('the instructions email', () => {
  it('gives the bib, the race page and the way to sign in, in plain words', () => {
    const mail = instructionsEmail({ to: 'lea@example.com', firstName: 'Léa', bib: '1002', distance: 'Marathon', race, raceUrl: 'https://run.sivoov.app/runners-2026', window: 'du 9 au 15 novembre', supportEmail: 'aide@example.com' });
    expect(mail.subject).toBe('Votre dossard 1002 · Course des coureurs');
    expect(mail.text).toContain('Dossard : 1002');
    expect(mail.text).toContain('1. Ouvrez la page de la course : https://run.sivoov.app/runners-2026');
    expect(mail.text).toContain('votre numéro de dossard (1002) et cette adresse email');
    expect(mail.text).toContain('Écrivez à aide@example.com');
    expect(mail.html).toContain('<a href="https://run.sivoov.app/runners-2026">');
    expect(`${mail.subject}${mail.text}${mail.html}`).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('adding a runner by hand', () => {
  it('refuses a bib already taken in the race, and adds a new one as added by hand', async () => {
    const cookie = await cookieFor('equipe@example.com');
    const fields = { bib: '2', firstName: 'Paul', lastName: 'Petit', email: 'paul@example.com', distanceKey: 'marathon', line1: '', line2: '', postalCode: '', city: '', country: 'France' };
    const taken = await post(`${base}/runners/new`, fields, cookie);
    expect(taken.status).toBe(409);
    const page = await taken.text();
    expect(page).toContain('déjà pris');
    expect(page).toContain('value="Paul"');
    expect((await stored('2'))?.first_name).toBe('Bruno');

    const added = await post(`${base}/runners/new`, { ...fields, bib: '77', notify: '1' }, cookie);
    expect(added.headers.get('location')).toBe(`/org/${SLUG}/runners/77?done=added_notified`);
    expect(await stored('77')).toMatchObject({ id: `${SLUG}-77`, first_name: 'Paul', source: 'manual', address: null });
    expect(await instructionsLog(env.FILES).list(`${SLUG}-77`)).toHaveLength(1);
    expect(await (await get(`${base}/runners/77`, cookie)).text()).toContain('Ajouté à la main le');
  });

  it('refuses a distance the race does not offer', async () => {
    const cookie = await cookieFor('equipe@example.com');
    const res = await post(`${base}/runners/new`, { bib: '78', firstName: 'A', lastName: 'B', email: 'ab@example.com', distanceKey: '5k' }, cookie);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('ne propose pas cette distance');
    expect(await stored('78')).toBeNull();
  });
});

describe('the import', () => {
  const csv = 'Dossard;Prénom;Nom;Email;Distance;Adresse;Code postal;Ville\r\n101;Jules;Faure;jules@example.com;Semi;;;\r\n102;Lou;Garnier;lou@example.com;42,195 km;5 rue Neuve;14800;Deauville\r\n103;Max;Henry;max@;Semi;;;\r\n2;Bruno;Blanc;bruno.blanc@example.com;21 km;;;\r\n';

  it('shows a preview and writes nothing, then writes everything on confirmation', async () => {
    const cookie = await cookieFor('orga@example.com');
    const fd = new FormData();
    fd.append('file', new File([csv], 'inscrits.csv', { type: 'text/csv' }));
    const preview = await (await postForm(`${base}/runners/import`, fd, cookie)).text();
    expect(preview).toContain('2 nouveaux coureurs, 1 mis à jour, 1 ligne refusée.');
    expect(preview).toContain('Ligne 4, dossard 103');
    expect(preview).toContain('Email « max@ » incorrect.');
    expect(await stored('101')).toBeNull();
    expect((await stored('2'))?.email).toBe('bruno@example.com');

    // The text travels in the page; confirming sends it back.
    const text = unescape(/<textarea name="csv" hidden[^>]*>([\s\S]*?)<\/textarea>/.exec(preview)?.[1] ?? '');
    expect(text).toBe(csv);
    const confirmed = await post(`${base}/runners/import`, { step: 'confirm', csv: text }, cookie);
    expect(confirmed.headers.get('location')).toBe(`/org/${SLUG}/runners?done=imported&added=2&updated=1&refused=1`);
    expect(await stored('101')).toMatchObject({ first_name: 'Jules', distance_key: 'half', source: 'import' });
    expect(JSON.parse((await stored('102'))!.address!)).toEqual({ line1: '5 rue Neuve', postalCode: '14800', city: 'Deauville', country: 'FR' });
    expect((await stored('2'))?.email).toBe('bruno.blanc@example.com');
    const list = await (await get(`${base}/runners?done=imported&added=2&updated=1&refused=1`, cookie)).text();
    expect(list).toContain('Import terminé : 2 coureurs ajoutés, 1 mis à jour. 1 ligne refusée n’a pas été importée.');
  });

  it('keeps a stored address when the file has none', async () => {
    const cookie = await cookieFor('orga@example.com');
    const res = await post(`${base}/runners/import`, { step: 'confirm', csv: 'dossard,email,prenom,nom,distance\n5,emma@example.com,Emma,Eluard-Petit,marathon\n' }, cookie);
    expect(res.headers.get('location')).toContain('added=0&updated=1');
    const row = await stored('5');
    expect(row?.last_name).toBe('Eluard-Petit');
    expect(JSON.parse(row!.address!)).toEqual(people.emma.address);
  });

  it('reads a Windows-1252 file from Excel with its accents', async () => {
    const cookie = await cookieFor('orga@example.com');
    // "Gaël Lefèvre", written by Excel on Windows: é = E9, ë = EB, è = E8, not valid UTF-8.
    const latin = (s: string) => Uint8Array.from([...s].map((ch) => ch.charCodeAt(0)));
    const file = () => {
      const fd = new FormData();
      fd.append('file', new File([latin('Dossard;Prénom;Nom;E-mail;Épreuve\r\n201;Gaël;Lefèvre;gael@example.com;Marathon\r\n')], 'inscrits.csv', { type: 'text/csv' }));
      return fd;
    };
    const preview = await (await postForm(`${base}/runners/import`, file(), cookie)).text();
    expect(preview).toContain('Gaël LEFÈVRE');
    const fd = file();
    fd.append('step', 'confirm');
    expect((await postForm(`${base}/runners/import`, fd, cookie)).status).toBe(302);
    expect(await stored('201')).toMatchObject({ first_name: 'Gaël', last_name: 'Lefèvre', distance_key: 'marathon' });
  });

  it('explains an Excel workbook or an empty form instead of importing garbage', async () => {
    const cookie = await cookieFor('orga@example.com');
    const fd = new FormData();
    fd.append('file', new File([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0])], 'inscrits.xlsx'));
    const workbook = await postForm(`${base}/runners/import`, fd, cookie);
    expect(workbook.status).toBe(400);
    expect(await workbook.text()).toContain('Enregistrer sous');
    expect(await (await post(`${base}/runners/import`, { csv: '  ' }, cookie)).text()).toContain('Choisissez un fichier');
  });

  it('offers a template with French headers', async () => {
    const cookie = await cookieFor('orga@example.com');
    const bytes = new Uint8Array(await (await get(`${base}/runners/import/modele.csv`, cookie)).arrayBuffer());
    // The BOM is what makes Excel read the accents right.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const template = new TextDecoder().decode(bytes);
    expect(template.split('\r\n')[0]).toBe('Dossard;Prénom;Nom;Email;Distance;Adresse;Complément;Code postal;Ville;Pays');
    expect(parseEntrantsCsv(template, { distances: ['marathon', 'half'] }).rejected).toEqual([]);
  });
});

describe('the medal addresses', () => {
  it('lists only the runners with an official finish, with their address when they gave one', async () => {
    const cookie = await cookieFor('orga@example.com');
    const csv = await (await get(`${base}/export/medals.csv`, cookie)).text();
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('Dossard;Prénom;Nom;Email;Distance;Temps;Adresse;Complément;Code postal;Ville;Pays');
    expect(lines.slice(1).map((l) => l.split(';')[0])).toEqual(['3', '5']);
    expect(lines[2]).toContain(';3:36:40;12 rue des Planches;;14800;Deauville;France');
  });

  it('writes the results with French words', async () => {
    const cookie = await cookieFor('orga@example.com');
    const csv = await (await get(`${base}/export/results.csv`, cookie)).text();
    expect(csv).toContain('Dossard;Prénom;Nom;Distance;Temps;Temps en secondes;Distance parcourue (m);Statut;Arrivée');
    expect(csv).toContain('3;Chloe;Colin;Marathon;3:30:00;12600;42300;Arrivé;2026-11-10 12:00');
    // A run that did not finish has no finish time, even though it stopped at some point.
    expect(csv).toContain('4;Denis;Dumas;Marathon;0:50:00;3000;9000;Pas arrivé;\r\n');
  });
});

describe('a long list', () => {
  it('shows a hundred runners a page', async () => {
    const cookie = await cookieFor('orga@example.com');
    const many = Array.from({ length: 100 }, (_, i) => entrant(String(5000 + i), 'Pat', `Page${i}`, 'half'));
    await env.DB.batch(many.map((e) => env.DB.prepare('INSERT INTO entrants (id, race_id, bib, email, first_name, last_name, distance_key) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(e.id, SLUG, e.bib, e.email, e.firstName, e.lastName, e.distanceKey)));
    const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM entrants WHERE race_id = ?').bind(SLUG).first<number>('n'))!;
    const first = await (await get(`${base}/runners`, cookie)).text();
    expect(listed(first)).toHaveLength(100);
    expect(first).toContain('Page 1 sur 2');
    expect(first).toContain(`/org/${SLUG}/runners?page=2`);
    const second = await (await get(`${base}/runners?page=2`, cookie)).text();
    expect(listed(second)).toHaveLength(total - 100);
    expect(second).toContain('Page 2 sur 2');
  });
});

describe('who reached the app', () => {
  const signIn = async (bib: string, email: string): Promise<string> => {
    await SELF.fetch('http://run.test/api/auth/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raceSlug: SLUG, bib, email }) });
    const res = await SELF.fetch('http://run.test/api/auth/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raceSlug: SLUG, bib, email, code: env.TEST_CODE }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  };
  const sessionOf = async (token: string) =>
    env.DB.prepare('SELECT client, device, last_seen_at FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).first<{ client: string; device: string | null; last_seen_at: string }>();
  /** The visit is written after the response: wait for it. */
  const eventually = async <T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> => {
    for (let i = 0; i < 50; i++) {
      const v = await read();
      if (ok(v)) return v;
      await new Promise((r) => setTimeout(r, 20));
    }
    return read();
  };

  it('records the phone named by the app header, and the last visit', async () => {
    await db(env.DB).upsertEntrant(entrant('300', 'Iris', 'Ibert', 'half'));
    const token = await signIn('300', 'iris@example.com');
    const me = await SELF.fetch('http://run.test/api/me', { headers: { Authorization: `Bearer ${token}`, 'X-Sivoov-Client': 'app/2.1.0 (ios 18.2; iPhone)' } });
    expect(me.status).toBe(200);
    const row = await eventually(() => sessionOf(token), (s) => s?.device !== null);
    expect(row?.client).toBe('app');
    expect(JSON.parse(row!.device!)).toEqual({ platform: 'ios', osVersion: '18.2', model: 'iPhone', appVersion: '2.1.0' });

    // An hour later, a call without the header still counts as a visit, and keeps the phone.
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').bind('2026-01-01T00:00:00.000Z', await sha256Hex(token)).run();
    expect((await SELF.fetch('http://run.test/api/runs', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    const later = await eventually(() => sessionOf(token), (s) => s?.last_seen_at !== '2026-01-01T00:00:00.000Z');
    expect(Date.parse(later!.last_seen_at)).toBeGreaterThan(Date.now() - 60_000);
    expect(JSON.parse(later!.device!).platform).toBe('ios');

    const cookie = await cookieFor('orga@example.com');
    expect(await (await get(`${base}/runners/300`, cookie)).text()).toContain('iPhone · iOS 18.2');
  });

  it('lets the app header through the browser preflight', async () => {
    const res = await SELF.fetch('http://run.test/api/me', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,x-sivoov-client' } });
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-sivoov-client');
  });
});
