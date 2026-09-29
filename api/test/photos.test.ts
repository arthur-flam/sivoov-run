import { SELF, env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PhotoMomentSchema } from '@sivoov/shared';
import { adminDb } from '../src/db/adminQueries';
import { photoQueries } from '../src/db/photoQueries';
import { db } from '../src/db/queries';
import { renderRemix } from '../src/lib/photos';
import { deauvilleCourses, deauvilleOrganizers, deauvilleRace, deauvilleTestEntrants } from '../src/seed/deauville';

const SLUG = deauvilleRace.slug;
const base = `http://run.test/${SLUG}`;

/** A PNG as far as anyone checks (the signature), and a JPEG the same way. */
const png = (tag: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tag, 1, 2, 3]);
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** The finish, on every course, and the racecourse, on the marathon only. Marc (1001) runs the half. */
const finish = PhotoMomentSchema.parse({
  id: 'moment-finish', raceId: deauvilleRace.id, title: 'La ligne', at: 'finish', ask: 'Bras levés.', scene: 'Les Planches, la mer.', createdAt: '2026-09-29T10:00:00Z',
});
const racecourse = PhotoMomentSchema.parse({ ...finish, id: 'moment-hippodrome', title: 'L’hippodrome', at: 'hippodrome', sort: 1 });

type Call = { url: string; body: { contents: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string } }> }> } };
const calls: Call[] = [];
let answer: () => Response = () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: toB64(png(9)) } }] } }] });
const realFetch = globalThis.fetch;

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all(deauvilleTestEntrants.map((e) => q.upsertEntrant(e)));
  await Promise.all(deauvilleOrganizers.map((o) => adminDb(env.DB).upsertOrganizer(o)));
  await photoQueries(env.DB).upsertMoment(finish);
  await photoQueries(env.DB).upsertMoment(racecourse);
  // The Worker shares this isolate: the image model is answered here, everything else goes on.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes(':generateContent')) return realFetch(input, init);
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return answer();
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const sessionFor = async (email: string): Promise<string> => {
  const res = await SELF.fetch('http://run.test/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code: '000000' }),
  });
  expect(res.status).toBe(200);
  return (await res.json<{ token: string }>()).token;
};
const cookie = (token: string) => ({ Cookie: `sivoov_session=${token}` });

const sendSelfie = (token: string, momentId: string, { consent = true, bytes = png(1) } = {}) => {
  const form = new FormData();
  form.append('photo', new File([bytes], 'me.png', { type: 'image/png' }));
  if (consent) form.append('consent', 'on');
  return SELF.fetch(`${base}/photos/${momentId}`, { method: 'POST', headers: cookie(token), body: form, redirect: 'manual' });
};

describe('a runner’s photos page', () => {
  it('asks a visitor with no session to sign in, and comes back', async () => {
    const res = await SELF.fetch(`${base}/photos`, { redirect: 'manual' });
    expect(res.headers.get('location')).toBe(`/${SLUG}/signin?next=%2F${SLUG}%2Fphotos`);
  });

  it('lists only the moments of the runner’s own course', async () => {
    const html = await (await SELF.fetch(`${base}/photos`, { headers: cookie(await sessionFor('marc@example.com')) })).text();
    expect(html).toContain('data-testid="moment-moment-finish"');
    expect(html).not.toContain('moment-hippodrome');
    expect(html).toContain('Bras levés.');
  });

  it('sends nothing to the model without the runner’s agreement', async () => {
    const before = calls.length;
    const res = await sendSelfie(await sessionFor('marc@example.com'), finish.id, { consent: false });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Cochez la case');
    expect(calls.length).toBe(before);
  });

  it('puts the runner into the race: their photo first, the prompt with their bib, the picture kept privately', async () => {
    const token = await sessionFor('marc@example.com');
    const res = await sendSelfie(token, finish.id);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/${SLUG}/photos#m-${finish.id}`);
    const call = calls[calls.length - 1]!;
    expect(call.url).toContain('/google-ai-studio/v1beta/models/gemini-2.5-flash-image:generateContent');
    const [prompt, selfie] = call.body.contents[0]!.parts;
    expect(prompt!.text).toContain('number 1001');
    expect(prompt!.text).toContain('crossing the finish line');
    expect(selfie!.inlineData!.mimeType).toBe('image/png');

    const [photo] = await photoQueries(env.DB).photos('deauville-2026-1001');
    expect(photo).toMatchObject({ status: 'done', attempts: 1, shown: false });
    const html = await (await SELF.fetch(`${base}/photos`, { headers: cookie(token) })).text();
    expect(html).toContain('data-testid="runner-photo"');
    const picture = `${base}/photos/${photo!.id}/picture`;
    // The runner sees it; nobody else does, until the runner shows it.
    expect((await SELF.fetch(picture, { headers: cookie(token) })).status).toBe(200);
    expect((await SELF.fetch(picture)).status).toBe(404);
    const lea = await sessionFor('lea@example.com');
    expect((await SELF.fetch(picture, { headers: cookie(lea) })).status).toBe(404);
  });

  it('shows a picture on the result page only once the runner says so', async () => {
    const token = await sessionFor('marc@example.com');
    const [photo] = await photoQueries(env.DB).photos('deauville-2026-1001');
    const form = new FormData();
    form.append('shown', '1');
    expect((await SELF.fetch(`${base}/photos/${photo!.id}/shown`, { method: 'POST', headers: cookie(token), body: form, redirect: 'manual' })).status).toBe(303);
    expect((await SELF.fetch(`${base}/photos/${photo!.id}/picture`)).status).toBe(200);
    const result = await (await SELF.fetch(`${base}/results/1001`)).text();
    expect(result).toContain(`/${SLUG}/photos/${photo!.id}/picture`);
  });

  it('makes three pictures per moment at most', async () => {
    const token = await sessionFor('marc@example.com');
    const [photo] = await photoQueries(env.DB).photos('deauville-2026-1001');
    const again = () => SELF.fetch(`${base}/photos/${photo!.id}/again`, { method: 'POST', headers: cookie(token), redirect: 'manual' });
    expect((await again()).status).toBe(303);
    expect((await again()).status).toBe(303);
    expect((await again()).status).toBe(429);
    expect((await photoQueries(env.DB).photo('deauville-2026-1001', photo!.id))!.attempts).toBe(3);
  });

  it('says so when the model refuses, and keeps nothing it did not make', async () => {
    answer = () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } });
    const lea = await sessionFor('lea@example.com');
    const res = await sendSelfie(lea, finish.id);
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('L’image n’a pas pu être créée');
    const [photo] = await photoQueries(env.DB).photos('deauville-2026-1002');
    expect(photo).toMatchObject({ status: 'failed', resultKey: undefined });
    expect(photo!.error).toContain('refused: SAFETY');
    answer = () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: toB64(png(9)) } }] } }] });
  });
});

describe('the image model', () => {
  it('reads the picture from Gemini’s answer, and says when there is none', async () => {
    const deps = (res: Response) => ({ files: env.FILES, model: 'm', gemini: { apiKey: 'k', gateway: 'https://gw' }, fetchImpl: (async () => res) as unknown as typeof fetch });
    const made = await renderRemix(deps(Response.json({ candidates: [{ content: { parts: [{ text: 'voilà' }, { inlineData: { mimeType: 'image/png', data: toB64(png(7)) } }] } }] })), 'p', { bytes: png(1), contentType: 'image/png' }, []);
    expect(made.ok && made.picture.contentType).toBe('image/png');
    const refused = await renderRemix(deps(Response.json({ candidates: [{ finishReason: 'IMAGE_SAFETY' }] })), 'p', { bytes: png(1), contentType: 'image/png' }, []);
    expect(refused).toMatchObject({ ok: false, reason: 'refused', detail: 'IMAGE_SAFETY' });
    const down = await renderRemix(deps(new Response('overloaded', { status: 503 })), 'p', { bytes: png(1), contentType: 'image/png' }, []);
    expect(down).toMatchObject({ ok: false, reason: 'error' });
  });
});

describe('the app’s way into the web', () => {
  it('gives the app its course’s photo moments', async () => {
    const res = await SELF.fetch('http://run.test/api/me', { headers: { Authorization: `Bearer ${await sessionFor('marc@example.com')}` } });
    const me = await res.json<{ photoMoments: Array<{ id: string; meters: number }> }>();
    expect(me.photoMoments).toEqual([expect.objectContaining({ id: finish.id, meters: 21097.5 })]);
  });

  it('opens the photos page signed in, once', async () => {
    const res = await SELF.fetch('http://run.test/api/me/web-link', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await sessionFor('marc@example.com')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'photos' }),
    });
    const { url } = await res.json<{ url: string }>();
    const path = new URL(url);
    expect(path.pathname).toBe(`/${SLUG}/link`);
    const first = await SELF.fetch(`http://run.test${path.pathname}${path.search}`, { redirect: 'manual' });
    expect(first.headers.get('location')).toBe(`/${SLUG}/photos`);
    const session = first.headers.get('set-cookie')!.split(';')[0]!;
    expect((await SELF.fetch(`${base}/photos`, { headers: { Cookie: session }, redirect: 'manual' })).status).toBe(200);
    // Used once: a second open asks for the email code, then goes to the same page.
    const second = await SELF.fetch(`http://run.test${path.pathname}${path.search}`, { redirect: 'manual' });
    expect(second.headers.get('location')).toBe(`/${SLUG}/signin?next=%2F${SLUG}%2Fphotos`);
  });

  it('never sends the browser off the race', async () => {
    const res = await SELF.fetch(`${base}/link?c=nope&next=${encodeURIComponent('https://evil.test/')}`, { redirect: 'manual' });
    expect(res.headers.get('location')).toBe(`/${SLUG}/signin?next=%2F${SLUG}%2Fphotos`);
  });
});

describe('the organizer’s photo moments', () => {
  const orgCookie = async (email: string) => {
    const form = new URLSearchParams({ step: 'code', email, code: env.TEST_CODE! });
    const res = await SELF.fetch('http://run.test/org/signin', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, redirect: 'manual' });
    return res.headers.get('set-cookie')!.split(';')[0]!;
  };

  it('adds a moment with photos of the place, which the model then gets after the runner’s photo', async () => {
    const owner = await orgCookie('orga@example.com');
    const form = new FormData();
    form.append('title', 'Sur les Planches');
    form.append('at', 'planches');
    form.append('ask', 'Un selfie face à la mer.');
    form.append('scene', 'La promenade en bois, les cabines, la plage.');
    form.append('refs', new File([png(3)], 'planches.png', { type: 'image/png' }));
    const res = await SELF.fetch(`http://run.test/org/${SLUG}/photos`, { method: 'POST', headers: { Cookie: owner }, body: form, redirect: 'manual' });
    expect(res.status).toBe(303);
    const added = (await photoQueries(env.DB).moments(deauvilleRace.id)).find((m) => m.title === 'Sur les Planches')!;
    expect(added).toMatchObject({ at: 'planches', refs: [expect.stringMatching(/^races\/deauville-2026\/[a-f0-9]{64}\.png$/)] });

    const lea = await sessionFor('lea@example.com');
    expect((await sendSelfie(lea, added.id)).status).toBe(303);
    const parts = calls[calls.length - 1]!.body.contents[0]!.parts;
    expect(parts).toHaveLength(3);
    expect(parts[0]!.text).toContain('The next image shows the real place');
  });

  it('lets a viewer look but not change', async () => {
    const viewer = await orgCookie('lecture@example.com');
    expect((await SELF.fetch(`http://run.test/org/${SLUG}/photos`, { headers: { Cookie: viewer } })).status).toBe(200);
    const form = new FormData();
    form.append('title', 'x');
    const res = await SELF.fetch(`http://run.test/org/${SLUG}/photos`, { method: 'POST', headers: { Cookie: viewer }, body: form, redirect: 'manual' });
    expect([302, 403]).toContain(res.status);
  });

  it('shows the organizer their own photo in the scene, and keeps it nowhere', async () => {
    const owner = await orgCookie('orga@example.com');
    const form = new FormData();
    form.append('photo', new File([png(5)], 'me.png', { type: 'image/png' }));
    const res = await SELF.fetch(`http://run.test/org/${SLUG}/photos/${finish.id}/try`, { method: 'POST', headers: { Cookie: owner }, body: form });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="tried-photo"');
    expect(html).toContain('data:image/png;base64,');
    expect(calls[calls.length - 1]!.body.contents[0]!.parts[0]!.text).toContain('number 1234');
  });
});

describe('« Supprimer mes données »', () => {
  it('erases the runner’s photos and the pictures made of them', async () => {
    const token = await sessionFor('lea@example.com');
    const before = await photoQueries(env.DB).photos('deauville-2026-1002');
    const keys = before.flatMap((p) => [p.selfieKey, ...(p.resultKey ? [p.resultKey] : [])]);
    expect(keys.length).toBeGreaterThan(0);
    const res = await SELF.fetch('http://run.test/api/me', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await photoQueries(env.DB).photos('deauville-2026-1002')).toEqual([]);
    expect(await Promise.all(keys.map((k) => env.FILES.head(k)))).toEqual(keys.map(() => null));
  });
});
