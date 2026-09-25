import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { OrganizerSchema, RaceSchema } from '@sivoov/shared';
import type { OrgRole } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { adminDb } from '../src/db/adminQueries';
import { deauvilleCourses, deauvilleOrganizers, deauvilleRace } from '../src/seed/deauville';

/**
 * The race admin: settings, team, and the Sivoov staff pages (new race, requests). Each area
 * works on a race of its own so the tests do not depend on each other's writes.
 */

const ORG = 'http://run.test/org';

const raceNamed = (slug: string) =>
  RaceSchema.parse({ ...deauvilleRace, id: slug, slug, name: `Course ${slug}`, theme: { ...deauvilleRace.theme, displayName: `Course ${slug}` } });
const SETTINGS = raceNamed('reglages-2026');
const TEAM = raceNamed('equipe-2026');

const member = (raceId: string, email: string, role: OrgRole) => OrganizerSchema.parse({ id: `${raceId}-${email}`, raceId, email, role, createdAt: '2026-09-01T10:00:00Z' });

beforeAll(async () => {
  const q = db(env.DB);
  const a = adminDb(env.DB);
  await Promise.all([deauvilleRace, SETTINGS, TEAM].map((r) => q.upsertRace(r)));
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all(deauvilleOrganizers.map((o) => a.upsertOrganizer(o)));
  await Promise.all([
    a.upsertOrganizer(member(SETTINGS.id, 'reglages@example.com', 'owner')),
    a.upsertOrganizer(member(SETTINGS.id, 'equipe@example.com', 'editor')),
    a.upsertOrganizer(member(SETTINGS.id, 'lecture@example.com', 'viewer')),
    a.upsertOrganizer(member(TEAM.id, 'chef@example.com', 'owner')),
    a.upsertOrganizer(member(TEAM.id, 'aide@example.com', 'editor')),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const post = (url: string, fields: Record<string, string | string[]>, cookie = '') => {
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([k, v]) => (Array.isArray(v) ? v : [v]).forEach((x) => body.append(k, x)));
  return SELF.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
    body: body.toString(),
    redirect: 'manual',
  });
};
const get = (url: string, cookie = '') => SELF.fetch(url, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });
const upload = (url: string, cookie: string, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return SELF.fetch(url, { method: 'POST', headers: { Cookie: cookie }, body: fd, redirect: 'manual' });
};

/** A session in one post: test addresses take TEST_CODE. */
const cookieFor = async (email: string): Promise<string> => {
  const res = await post(`${ORG}/signin`, { step: 'code', email, code: env.TEST_CODE! });
  expect(res.status).toBe(302);
  return res.headers.get('set-cookie')!.split(';')[0]!;
};

/** Emails go to the console in tests (no Email binding): each one is a `[mail] to=...` line. */
const catchMail = () => {
  const spy = vi.spyOn(console, 'log');
  return () => spy.mock.calls.map((args) => String(args[0])).filter((line) => line.startsWith('[mail]'));
};

const raceOf = async (slug: string) => (await db(env.DB).raceBySlug(slug))!;

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52];
const png = (size = 64): Uint8Array => {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_HEAD);
  bytes.set([size % 251, (size >> 8) % 251], 16);
  return bytes;
};

describe('race settings', () => {
  const base = `${ORG}/${SETTINGS.slug}/settings`;

  it('shows every card to an owner, with the window on the race’s clock', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const html = await (await get(base, cookie)).text();
    ['La course', 'Quand les coureurs peuvent courir', 'Contact pour les coureurs', 'Apparence', 'Publication', 'Vente en ligne'].forEach((title) =>
      expect(html).toContain(title),
    );
    expect(html).toContain('value="2026-11-09T00:00"');
    expect(html).toContain('value="2026-11-15T23:59"');
    expect(html).toContain(`href="/org/${SETTINGS.slug}/runners/import"`);
  });

  it('saves the race card and says so in that card', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const res = await post(
      `${base}/race`,
      { name: 'Marathon de Test', displayName: 'Marathon Test', city: 'Caen', country: 'BE', dateStart: '2026-11-14', dateEnd: '2026-11-15', organizerUrl: 'www.test.fr' },
      cookie,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/org/${SETTINGS.slug}/settings?done=race#race`);
    const race = await raceOf(SETTINGS.slug);
    expect(race).toMatchObject({ name: 'Marathon de Test', city: 'Caen', country: 'BE', organizerUrl: 'https://www.test.fr' });
    expect(race.theme.displayName).toBe('Marathon Test');
    expect(await (await get(`${base}?done=race`, cookie)).text()).toContain('Les informations de la course sont enregistrées.');
  });

  it('refuses a color that is not a color, and keeps the saved one', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const res = await post(`${base}/colors`, { primary: 'red', onPrimary: '#ffffff' }, cookie);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Choisissez une couleur.');
    expect((await raceOf(SETTINGS.slug)).theme.primary).toBe(SETTINGS.theme.primary);
  });

  it('saves colors, and warns when the text would be hard to read on them', async () => {
    const cookie = await cookieFor('reglages@example.com');
    expect((await post(`${base}/colors`, { primary: '#FFFF00', onPrimary: '#ffffff' }, cookie)).status).toBe(302);
    const race = await raceOf(SETTINGS.slug);
    expect(race.theme).toMatchObject({ primary: '#ffff00', onPrimary: '#ffffff' });
    expect(await (await get(base, cookie)).text()).toContain('class="flash warn" data-contrast');
    await post(`${base}/colors`, { primary: '#0f3d6e', onPrimary: '#ffffff' }, cookie);
    expect(await (await get(base, cookie)).text()).toContain('class="flash warn hide" data-contrast');
  });

  it('refuses a support address that is not an email, keeps what was typed, and removes it when emptied', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const bad = await post(`${base}/contact`, { supportEmail: 'pas-une-adresse' }, cookie);
    expect(bad.status).toBe(400);
    const html = await bad.text();
    expect(html).toContain('Cette adresse email ne semble pas valide.');
    expect(html).toContain('value="pas-une-adresse"');
    expect((await raceOf(SETTINGS.slug)).supportEmail).toBeUndefined();
    expect((await post(`${base}/contact`, { supportEmail: ' Aide@Course.fr ' }, cookie)).status).toBe(302);
    expect((await raceOf(SETTINGS.slug)).supportEmail).toBe('aide@course.fr');
    const removed = await post(`${base}/contact`, { supportEmail: '' }, cookie);
    expect(removed.headers.get('location')).toContain('done=contact_removed');
    expect((await raceOf(SETTINGS.slug)).supportEmail).toBeUndefined();
  });

  it('refuses a window that closes before it opens', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const res = await post(`${base}/window`, { windowStart: '2026-11-15T00:00', windowEnd: '2026-11-09T23:59' }, cookie);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('La fermeture doit venir après l’ouverture.');
    expect((await raceOf(SETTINGS.slug)).windowStart).toBe(SETTINGS.windowStart);
  });

  it('stores the window with the offset of each end, across the clock change', async () => {
    const cookie = await cookieFor('reglages@example.com');
    // Paris goes back from summer time to winter time on Sunday 25 October 2026.
    expect((await post(`${base}/window`, { windowStart: '2026-10-24T00:00', windowEnd: '2026-10-26T23:59' }, cookie)).status).toBe(302);
    const race = await raceOf(SETTINGS.slug);
    expect(race.windowStart).toBe('2026-10-24T00:00:00+02:00');
    expect(race.windowEnd).toBe('2026-10-26T23:59:59+01:00');
    const html = await (await get(base, cookie)).text();
    expect(html).toContain('value="2026-10-24T00:00"');
    expect(html).toContain('value="2026-10-26T23:59"');
    await post(`${base}/window`, { windowStart: '2026-11-09T00:00', windowEnd: '2026-11-15T23:59' }, cookie);
    expect((await raceOf(SETTINGS.slug)).windowEnd).toBe(SETTINGS.windowEnd);
  });

  it('refuses a physical race that ends before it starts', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const res = await post(
      `${base}/race`,
      { name: 'X', displayName: 'X', city: 'Caen', country: 'FR', dateStart: '2026-11-15', dateEnd: '2026-11-14', organizerUrl: '' },
      cookie,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Le dernier jour ne peut pas être avant le premier.');
  });

  it('hides a draft from the home page and the race list, not from its own address', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const listed = async () => ((await (await SELF.fetch('http://run.test/api/races')).json()) as { races: Array<{ slug: string }> }).races.map((r) => r.slug);
    expect(await listed()).toContain(SETTINGS.slug);
    expect((await post(`${base}/status`, { status: 'draft' }, cookie)).status).toBe(302);
    expect((await raceOf(SETTINGS.slug)).status).toBe('draft');
    expect(await listed()).not.toContain(SETTINGS.slug);
    expect(await (await SELF.fetch('http://run.test/')).text()).not.toContain(`/${SETTINGS.slug}"`);
    expect((await SELF.fetch(`http://run.test/${SETTINGS.slug}`)).status).toBe(200);
    expect((await post(`${base}/status`, { status: 'published' }, cookie)).status).toBe(400);
    await post(`${base}/status`, { status: 'open' }, cookie);
    expect(await listed()).toContain(SETTINGS.slug);
  });

  it('refuses the settings to an editor and to a viewer, even by a direct post', async () => {
    for (const email of ['equipe@example.com', 'lecture@example.com']) {
      const cookie = await cookieFor(email);
      expect((await get(base, cookie)).headers.get('location')).toBe(`/org/${SETTINGS.slug}?denied=1`);
      expect((await post(`${base}/status`, { status: 'closed' }, cookie)).status).toBe(302);
      expect((await upload(`${base}/logo`, cookie, new File([png()], 'logo.png', { type: 'image/png' }))).status).toBe(302);
      expect(await (await get(`${ORG}/${SETTINGS.slug}`, cookie)).text()).not.toContain('Réglages');
    }
    const race = await raceOf(SETTINGS.slug);
    expect(race.status).toBe('open');
    expect(race.theme.logo).toBeUndefined();
  });
});

describe('race pictures', () => {
  const base = `${ORG}/${SETTINGS.slug}/settings`;

  it('refuses an SVG, even named and typed as a PNG', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>';
    const res = await upload(`${base}/logo`, cookie, new File([svg], 'logo.png', { type: 'image/png' }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('le format SVG ne l’est pas');
    expect((await raceOf(SETTINGS.slug)).theme.logo).toBeUndefined();
  });

  it('refuses a logo over 2 MB but takes the same file as the header photo, up to 5 MB', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const big = new File([png(2 * 1024 * 1024 + 1)], 'grand.png', { type: 'image/png' });
    const refused = await upload(`${base}/logo`, cookie, big);
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain('Ce fichier dépasse 2 Mo.');
    expect((await upload(`${base}/hero`, cookie, big)).status).toBe(302);
    const huge = await upload(`${base}/hero`, cookie, new File([png(5 * 1024 * 1024 + 1)], 'enorme.png', { type: 'image/png' }));
    expect(huge.status).toBe(400);
    expect(await huge.text()).toContain('Ce fichier dépasse 5 Mo.');
  });

  it('stores a logo under the race, puts its address in the theme and serves it from /media with its type', async () => {
    const cookie = await cookieFor('reglages@example.com');
    const bytes = png(300);
    const res = await upload(`${base}/logo`, cookie, new File([bytes], 'logo.png', { type: 'image/png' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/org/${SETTINGS.slug}/settings?done=logo#look`);
    const logo = (await raceOf(SETTINGS.slug)).theme.logo!;
    expect(logo).toMatch(new RegExp(`^${env.BASE_URL}/media/races/${SETTINGS.id}/[a-f0-9]{64}\\.png$`));
    const served = await SELF.fetch(`http://run.test${new URL(logo).pathname}`);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
    expect(await (await get(base, cookie)).text()).toContain(`src="${logo}"`);
    // "Retirer" takes it off the theme.
    expect((await post(`${base}/logo/remove`, {}, cookie)).headers.get('location')).toContain('done=logo_removed');
    expect((await raceOf(SETTINGS.slug)).theme.logo).toBeUndefined();
  });

  it('serves nothing from /media outside the race pictures', async () => {
    await env.FILES.put('courses/secret.json', '{}');
    expect((await SELF.fetch('http://run.test/media/courses/secret.json')).status).toBe(404);
    expect((await SELF.fetch(`http://run.test/media/races/${SETTINGS.id}/${'0'.repeat(64)}.png`)).status).toBe(404);
    expect((await SELF.fetch(`http://run.test/media/races/${SETTINGS.id}/../../courses/secret.json`)).status).toBe(404);
    expect((await SELF.fetch(`http://run.test/media/races/${SETTINGS.id}/logo.svg`)).status).toBe(404);
  });
});

describe('race team', () => {
  const base = `${ORG}/${TEAM.slug}/team`;
  const members = () => adminDb(env.DB).members(TEAM.id);

  it('lists the members with their role and how they joined; staff are not listed', async () => {
    const html = await (await get(base, await cookieFor('chef@example.com'))).text();
    expect(html).toContain('chef@example.com');
    expect(html).toContain('aide@example.com');
    expect(html).toContain('Responsable');
    expect(html).toContain('Dans l’équipe depuis le 1 sept. 2026');
    const staffView = await (await get(base, await cookieFor('staff@example.com'))).text();
    const list = staffView.slice(staffView.indexOf('<ul class="rows">'), staffView.indexOf('Inviter quelqu'));
    expect(list).toContain('chef@example.com');
    expect(list).not.toContain('staff@example.com');
  });

  it('keeps the team to owners and staff', async () => {
    const cookie = await cookieFor('aide@example.com');
    expect((await get(base, cookie)).headers.get('location')).toBe(`/org/${TEAM.slug}?denied=1`);
    expect((await post(`${base}/invite`, { email: 'intrus@example.com', role: 'owner' }, cookie)).status).toBe(302);
    expect((await members()).map((m) => m.email)).not.toContain('intrus@example.com');
  });

  it('invites someone with one email, and a second invitation updates the role without a second row', async () => {
    const cookie = await cookieFor('chef@example.com');
    const mails = catchMail();
    const res = await post(`${base}/invite`, { email: 'Nina@Example.com', name: 'Nina Roux', role: 'viewer' }, cookie);
    expect(res.headers.get('location')).toBe(`/org/${TEAM.slug}/team?done=invited`);
    expect(mails()).toHaveLength(1);
    const mail = mails()[0]!;
    expect(mail).toContain('to=nina@example.com');
    expect(mail).toContain('chef@example.com vous invite dans l’équipe de Course equipe-2026');
    expect(mail).toContain('avec le rôle Lecture seule');
    expect(mail).toContain('Consulter et télécharger les listes');
    expect(mail).toContain(`${env.BASE_URL}/org/signin`);
    expect(mail).toContain('Il n’y a pas de mot de passe.');
    const nina = (await members()).find((m) => m.email === 'nina@example.com');
    expect(nina).toMatchObject({ role: 'viewer', name: 'Nina Roux', invitedBy: 'chef@example.com' });

    const again = await post(`${base}/invite`, { email: 'nina@example.com', name: '', role: 'editor' }, cookie);
    expect(again.headers.get('location')).toBe(`/org/${TEAM.slug}/team?done=reinvited`);
    const ninas = (await members()).filter((m) => m.email === 'nina@example.com');
    expect(ninas).toHaveLength(1);
    expect(ninas[0]).toMatchObject({ role: 'editor', name: 'Nina Roux' });
    // The invited person can sign in and reaches the race.
    expect((await get(`${ORG}/${TEAM.slug}`, await cookieFor('nina@example.com'))).status).toBe(200);
  });

  it('refuses an invitation without a valid email and keeps what was typed', async () => {
    const res = await post(`${base}/invite`, { email: 'nina', name: 'Nina', role: 'editor' }, await cookieFor('chef@example.com'));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Cette adresse email ne semble pas valide.');
    expect(html).toContain('value="nina"');
  });

  it('never leaves a race without an owner', async () => {
    const cookie = await cookieFor('chef@example.com');
    const demote = await post(`${base}/role`, { email: 'chef@example.com', role: 'editor' }, cookie);
    expect(demote.status).toBe(409);
    expect(await demote.text()).toContain('Une course garde toujours au moins un responsable.');
    expect((await post(`${base}/remove`, { email: 'chef@example.com' }, cookie)).status).toBe(409);
    const reinvited = await post(`${base}/invite`, { email: 'chef@example.com', role: 'viewer' }, cookie);
    expect(reinvited.status).toBe(409);
    expect(await reinvited.text()).toContain('Une course garde toujours au moins un responsable.');
    expect((await members()).find((m) => m.email === 'chef@example.com')?.role).toBe('owner');
  });

  it('keeps an owner when every owner is invited again as editor at the same moment', async () => {
    const race = raceNamed('quatuor-2026');
    const owners = ['un@example.com', 'deux@example.com', 'trois@example.com', 'quatre@example.com'];
    await db(env.DB).upsertRace(race);
    await Promise.all(owners.map((email) => adminDb(env.DB).upsertOrganizer(member(race.id, email, 'owner'))));
    const cookies = await Promise.all(owners.map(cookieFor));
    // Each page was read with four owners; the last change to reach the database is refused.
    const responses = await Promise.all(owners.map((email, i) => post(`${ORG}/${race.slug}/team/invite`, { email, role: 'editor' }, cookies[i])));
    expect(responses.map((r) => r.status).sort()).toEqual([302, 302, 302, 409]);
    expect(await responses.find((r) => r.status === 409)!.text()).toContain('Une course garde toujours au moins un responsable.');
    expect((await adminDb(env.DB).members(race.id)).filter((m) => m.role === 'owner')).toHaveLength(1);
  });

  it('lets the owner step down once someone else is owner, and removes a member', async () => {
    const cookie = await cookieFor('chef@example.com');
    expect((await post(`${base}/role`, { email: 'aide@example.com', role: 'owner' }, cookie)).headers.get('location')).toBe(`/org/${TEAM.slug}/team?done=role`);
    // Stepping down from owner leaves the team page: they cannot manage it any more.
    expect((await post(`${base}/role`, { email: 'chef@example.com', role: 'editor' }, cookie)).headers.get('location')).toBe(`/org/${TEAM.slug}`);
    const aide = await cookieFor('aide@example.com');
    expect((await post(`${base}/remove`, { email: 'chef@example.com' }, aide)).headers.get('location')).toBe(`/org/${TEAM.slug}/team?done=removed`);
    expect((await members()).map((m) => m.email)).not.toContain('chef@example.com');
    expect((await get(`${ORG}/${TEAM.slug}`, cookie)).headers.get('location')).toBe('/org?denied=1');
  });
});

describe('staff pages', () => {
  const newRace = {
    name: 'Trail des Falaises',
    displayName: '',
    city: 'Étretat',
    country: 'FR',
    dateStart: '2027-05-15',
    dateEnd: '2027-05-15',
    windowStart: '',
    windowEnd: '',
    distances: ['10k', 'marathon'],
    ownerEmail: 'Directeur@Example.com',
    slug: 'trail-des-falaises-2027',
  };

  it('keeps race creation and the requests for staff', async () => {
    const cookie = await cookieFor('orga@example.com');
    expect((await get(`${ORG}/new`, cookie)).headers.get('location')).toBe('/org?denied=1');
    expect((await get(`${ORG}/leads`, cookie)).headers.get('location')).toBe('/org?denied=1');
    expect((await post(`${ORG}/new`, { ...newRace, slug: 'pirate-2027' }, cookie)).headers.get('location')).toBe('/org?denied=1');
    expect(await db(env.DB).raceBySlug('pirate-2027')).toBeNull();
    expect((await get(`${ORG}/new`)).headers.get('location')).toBe(`/org/signin?next=${encodeURIComponent('/org/new')}`);
  });

  it('refuses a page address that is a reserved word, already taken, or badly written', async () => {
    const cookie = await cookieFor('staff@example.com');
    const reserved = await post(`${ORG}/new`, { ...newRace, slug: 'media' }, cookie);
    expect(reserved.status).toBe(400);
    expect(await reserved.text()).toContain('Ce mot est déjà utilisé par le site.');
    const taken = await post(`${ORG}/new`, { ...newRace, slug: 'deauville-2026' }, cookie);
    expect(taken.status).toBe(400);
    expect(await taken.text()).toContain('Une course utilise déjà cette adresse.');
    const badly = await post(`${ORG}/new`, { ...newRace, slug: 'Trail Falaises' }, cookie);
    expect(badly.status).toBe(400);
    expect(await badly.text()).toContain('Des lettres minuscules sans accents');
    const none = await post(`${ORG}/new`, { ...newRace, distances: [] }, cookie);
    expect(await none.text()).toContain('Cochez au moins une distance.');
    expect(await db(env.DB).raceBySlug('trail-des-falaises-2027')).toBeNull();
  });

  it('creates a draft race with its courses, the race week as window, and its owner invited', async () => {
    const cookie = await cookieFor('staff@example.com');
    const mails = catchMail();
    const res = await post(`${ORG}/new`, newRace, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/org/trail-des-falaises-2027');
    const race = await raceOf('trail-des-falaises-2027');
    expect(race).toMatchObject({ id: 'trail-des-falaises-2027', status: 'draft', timezone: 'Europe/Paris', city: 'Étretat' });
    expect(race.theme.displayName).toBe('Trail des Falaises');
    // Saturday 15 May 2027: Monday 10 to Sunday 16 May, summer time.
    expect(race.windowStart).toBe('2027-05-10T00:00:00+02:00');
    expect(race.windowEnd).toBe('2027-05-16T23:59:59+02:00');
    const courses = await db(env.DB).coursesForRace(race.id);
    expect(courses.map((c) => [c.id, c.distanceM])).toEqual([
      ['trail-des-falaises-2027-marathon', 42195],
      ['trail-des-falaises-2027-10k', 10000],
    ]);
    const team = await adminDb(env.DB).members(race.id);
    expect(team).toHaveLength(1);
    expect(team[0]).toMatchObject({ email: 'directeur@example.com', role: 'owner', invitedBy: 'staff@example.com' });
    expect(mails()).toHaveLength(1);
    expect(mails()[0]).toContain('to=directeur@example.com');
    expect(mails()[0]).toContain('avec le rôle Responsable');
    // The owner signs in and runs their race; the draft is not listed publicly.
    const owner = await cookieFor('directeur@example.com');
    expect((await get(`${ORG}/trail-des-falaises-2027/settings`, owner)).status).toBe(200);
    const listed = (await (await SELF.fetch('http://run.test/api/races')).json()) as { races: Array<{ slug: string }> };
    expect(listed.races.map((r) => r.slug)).not.toContain('trail-des-falaises-2027');
    // The same address cannot be taken twice.
    expect((await post(`${ORG}/new`, newRace, cookie)).status).toBe(400);
  });

  it('suggests the page address from the name when it is left empty', async () => {
    const cookie = await cookieFor('staff@example.com');
    const res = await post(`${ORG}/new`, { ...newRace, name: 'Les 10 km de l’Île', slug: '', distances: ['10k'], windowStart: '2027-06-01T08:00', windowEnd: '2027-06-07T20:00' }, cookie);
    expect(res.headers.get('location')).toBe('/org/les-10-km-de-l-ile');
    const race = await raceOf('les-10-km-de-l-ile');
    expect(race.windowStart).toBe('2027-06-01T08:00:00+02:00');
    expect(race.windowEnd).toBe('2027-06-07T20:00:59+02:00');
  });

  it('lists the requests newest first, and marks them handled or open again', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO leads (id, name, email, race, message, locale, created_at) VALUES ('lead-old', 'Paul Morin', 'paul@example.com', 'Semi de Caen', 'Bonjour, nous organisons un semi.', 'fr', '2026-09-01T10:00:00Z')"),
      env.DB.prepare("INSERT INTO leads (id, name, email, race, message, locale, created_at) VALUES ('lead-new', 'Ann Lee', 'ann@example.com', 'Bath Half', NULL, 'en', '2026-09-20T10:00:00Z')"),
    ]);
    const cookie = await cookieFor('staff@example.com');
    const html = await (await get(`${ORG}/leads`, cookie)).text();
    expect(html.indexOf('Ann Lee')).toBeGreaterThan(-1);
    expect(html.indexOf('Ann Lee')).toBeLessThan(html.indexOf('Paul Morin'));
    expect(html).toContain('href="mailto:paul@example.com?subject=Sivoov%20Run%20pour%20Semi%20de%20Caen"');
    expect(html).toContain('Bonjour, nous organisons un semi.');

    expect((await post(`${ORG}/leads/lead-old/handled`, {}, cookie)).headers.get('location')).toBe('/org/leads?done=handled');
    const handledAt = await env.DB.prepare("SELECT handled_at FROM leads WHERE id = 'lead-old'").first<{ handled_at: string | null }>();
    expect(handledAt?.handled_at).toMatch(/^\d{4}-/);
    expect(await (await get(`${ORG}/leads`, cookie)).text()).not.toContain('Paul Morin');
    expect(await (await get(`${ORG}/leads?show=handled`, cookie)).text()).toContain('Paul Morin');

    expect((await post(`${ORG}/leads/lead-old/reopen`, {}, cookie)).headers.get('location')).toBe('/org/leads?done=reopened');
    expect(await (await get(`${ORG}/leads`, cookie)).text()).toContain('Paul Morin');
    expect((await post(`${ORG}/leads/nope/handled`, {}, cookie)).status).toBe(404);
    expect((await post(`${ORG}/leads/lead-old/handled`, {}, await cookieFor('orga@example.com'))).headers.get('location')).toBe('/org?denied=1');
  });
});
