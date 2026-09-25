import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/queries';
import { MAX_LEADS_PER_EMAIL_PER_DAY } from '../src/lib/leads';
import { deauvilleCourses, deauvilleRace } from '../src/seed/deauville';

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const page = async (path: string) => {
  const res = await SELF.fetch(`http://run.test${path}`);
  return { status: res.status, html: await res.text() };
};

const postLead = (fields: Record<string, string>, query = '') =>
  SELF.fetch(`http://run.test/organisateurs${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });

const leadsFrom = async (email: string) =>
  (await env.DB.prepare('SELECT * FROM leads WHERE email = ? ORDER BY created_at').bind(email).all<Record<string, unknown>>()).results;

describe('runner home', () => {
  it('shows the open races as cards, with their dates and distances, in French and in English', async () => {
    const fr = await page('/');
    expect(fr.status).toBe(200);
    expect(fr.html).toContain('href="/deauville-2026"');
    expect(fr.html).toContain('Marathon International de Deauville');
    expect(fr.html).toContain('14 et 15 novembre 2026');
    expect(fr.html).toContain('À courir du 9 au 15 novembre');
    expect(fr.html).toContain('Semi-marathon');
    const en = await page('/?lang=en');
    expect(en.html).toContain('A real race, wherever you run.');
    expect(en.html).toContain('14 and 15 November 2026');
  });
  it('points race organizers to their page, and to their sign-in in the footer', async () => {
    const { html } = await page('/');
    expect(html).toContain('Vous organisez une course');
    expect(html.match(/href="\/organisateurs"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('href="/org"');
  });
});

describe('race landing', () => {
  it('shows where to write only when the race has a support address', async () => {
    expect((await page('/deauville-2026')).html).not.toContain('Une question');
    await db(env.DB).upsertRace({ ...deauvilleRace, supportEmail: 'aide@example.com' });
    const { html } = await page('/deauville-2026');
    expect(html).toContain('Une question');
    expect(html).toContain('href="mailto:aide@example.com"');
    await db(env.DB).upsertRace(deauvilleRace);
  });
  it('shows the logo and the header photo the organizer chose in the settings, and nothing when there are none', async () => {
    expect((await page('/deauville-2026')).html).not.toContain('class="race-logo"');
    const logo = 'https://run.test/media/races/deauville-2026/logo.png';
    const hero = 'https://run.test/media/races/deauville-2026/hero.jpg';
    await db(env.DB).upsertRace({ ...deauvilleRace, theme: { ...deauvilleRace.theme, logo, hero } });
    const { html } = await page('/deauville-2026');
    expect(html).toContain(`class="race-logo" src="${logo}"`);
    expect(html).toContain(`class="race-banner" src="${hero}"`);
    await db(env.DB).upsertRace(deauvilleRace);
  });
});

describe('organizers page', () => {
  it('renders in French by default and in English on request', async () => {
    const fr = await page('/organisateurs');
    expect(fr.status).toBe(200);
    expect(fr.html).toContain('Votre course est complète');
    expect(fr.html).toContain('Tarif sur demande');
    expect(fr.html).toContain('href="/deauville-2026"');
    expect(fr.html).toContain('name="race"');
    const en = await page('/organisateurs?lang=en');
    expect(en.html).toContain('Your race is sold out?');
    expect(en.html).toContain('Pricing on request');
  });
  it('sends /organizers to the English page', async () => {
    const res = await SELF.fetch('http://run.test/organizers', { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/organisateurs?lang=en');
  });
  it('stores a valid lead, thanks the sender and tells every staff address', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await postLead({ name: 'Claire Dubois', email: 'Claire@Example.com', race: 'Trail des Falaises', message: 'Complet en trois jours.' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Merci, Claire Dubois.');
    const [lead] = await leadsFrom('claire@example.com');
    expect(lead).toMatchObject({ name: 'Claire Dubois', race: 'Trail des Falaises', message: 'Complet en trois jours.', locale: 'fr', handled_at: null });
    const mails = log.mock.calls.map(([line]) => String(line)).filter((line) => line.startsWith('[mail]'));
    expect(mails.map((m) => m.match(/to=(\S+)/)?.[1])).toEqual(['arthur.flam@gmail.com', 'staff@example.com']);
    expect(mails[0]).toContain('Trail des Falaises');
    expect(mails[0]).toContain('claire@example.com');
  });
  it('keeps the language of an English lead, and a lead without a message', async () => {
    const res = await postLead({ name: 'Sam Reed', email: 'sam@example.com', race: 'Loch Ness Marathon', message: '' }, '?lang=en');
    expect(await res.text()).toContain('Thank you, Sam Reed.');
    expect((await leadsFrom('sam@example.com'))[0]).toMatchObject({ locale: 'en', message: null });
  });
  it('sends the form back with what was typed and what is wrong, and stores nothing', async () => {
    const res = await postLead({ name: ' ', email: 'marie@exemple', race: 'Les Foulées du Port' });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Indiquez votre nom.');
    expect(html).toContain('Cette adresse email ne semble pas valide.');
    expect(html).not.toContain('Indiquez le nom de votre course.');
    expect(html).toContain('value="marie@exemple"');
    expect(html).toContain('value="Les Foulées du Port"');
    expect(await leadsFrom('marie@exemple')).toHaveLength(0);
  });
  it(`refuses more than ${MAX_LEADS_PER_EMAIL_PER_DAY} leads a day from one address`, async () => {
    const lead = { name: 'Paul Martin', email: 'paul@example.com', race: '10 km de Caen' };
    for (let n = 0; n < MAX_LEADS_PER_EMAIL_PER_DAY; n++) expect((await postLead(lead)).status).toBe(200);
    const refused = await postLead(lead);
    expect(refused.status).toBe(429);
    expect(await refused.text()).toContain('déjà écrit');
    expect(await leadsFrom('paul@example.com')).toHaveLength(MAX_LEADS_PER_EMAIL_PER_DAY);
  });
  it('thanks a bot that fills the hidden field, and keeps nothing', async () => {
    const res = await postLead({ name: 'Bot', email: 'bot@example.com', race: 'Spam', website: 'https://spam.example' });
    expect(res.status).toBe(200);
    expect(await leadsFrom('bot@example.com')).toHaveLength(0);
  });
});
