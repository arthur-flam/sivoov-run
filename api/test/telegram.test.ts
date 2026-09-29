import { SELF, createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RunSchema } from '@sivoov/shared';
import app from '../src/index';
import { db } from '../src/db/queries';
import { deauvilleCourses, deauvilleRace, deauvilleTestEntrants } from '../src/seed/deauville';

/**
 * The owner's Telegram lines, end to end. The test config sets no Telegram secrets, so SELF is
 * the Worker as it runs locally; `withTelegram` calls the same app with both set. The worker
 * shares this isolate, so stubbing the global fetch catches what it would send.
 */
const realFetch = globalThis.fetch;
let sent: Array<{ url: string; text: string }> = [];

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all(deauvilleTestEntrants.map((e) => q.upsertEntrant(e)));
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.telegram.org/')) {
      sent = [...sent, { url, text: (JSON.parse(String(init?.body)) as { text: string }).text }];
      return Response.json({ ok: true });
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  sent = [];
});

const TELEGRAM = { TELEGRAM_BOT_TOKEN: 'test-bot-token', TELEGRAM_CHAT_ID: '42' };

/** One request to the Worker with the two secrets set, waiting for what it does after the response. */
const withTelegram = async (path: string, init: RequestInit): Promise<Response> => {
  const ctx = createExecutionContext();
  const res = await app.request(`http://run.test${path}`, init, { ...env, ...TELEGRAM }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

const json = (body: unknown, headers: Record<string, string> = {}, method = 'POST') => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const PHONE = { 'X-Sivoov-Client': 'app/2.0.0 (android 16; samsung SM-S911B)' };
const MARC = { email: 'marc@example.com' };

describe('telegram notices', () => {
  it('tells the owner who signed in to the app, on which phone, only when the bot is set up', async () => {
    const quiet = await SELF.fetch('http://run.test/api/auth/verify', json({ ...MARC, code: env.TEST_CODE }, PHONE));
    expect(quiet.status).toBe(200);
    expect(sent).toEqual([]);

    const res = await withTelegram('/api/auth/verify', json({ ...MARC, code: env.TEST_CODE }, PHONE));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://api.telegram.org/bottest-bot-token/sendMessage');
    expect(sent[0]!.text).toBe('[local] 🔑 Connexion de Marc DUPONT (dossard 1001, Marathon International de Deauville, test) sur l’app Android 16 · samsung SM-S911B · v2.0.0');
  });

  it('says nothing about a wrong code', async () => {
    expect((await withTelegram('/api/auth/verify', json({ ...MARC, code: '999999' }))).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('tells the owner about a web sign-in', async () => {
    const form = new URLSearchParams({ step: 'code', email: MARC.email, code: env.TEST_CODE! }).toString();
    const res = await withTelegram('/deauville-2026/signin', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(sent.map((s) => s.text)).toEqual(['[local] 🔑 Connexion de Marc DUPONT (dossard 1001, Marathon International de Deauville, test) sur le web']);
  });

  it('hears of a start from the app, for the runner’s own course only', async () => {
    const { token } = (await (await SELF.fetch('http://run.test/api/auth/verify', json({ ...MARC, code: env.TEST_CODE }))).json()) as { token: string };
    const auth = { Authorization: `Bearer ${token}` };
    expect((await withTelegram('/api/runs/run-1/started', json({ courseId: 'deauville-2026-half', source: 'simulation' }, auth))).status).toBe(202);
    expect(sent.map((s) => s.text)).toEqual(['[local] ▶️ Départ de Marc DUPONT (dossard 1001, Marathon International de Deauville, test) sur 21,1 km : simulation']);
    sent = [];
    expect((await withTelegram('/api/runs/run-1/started', json({ courseId: 'deauville-2026-marathon', source: 'app' }, auth))).status).toBe(400);
    expect((await withTelegram('/api/runs/run-1/started', json({ courseId: 'deauville-2026-half', source: 'upload' }, auth))).status).toBe(400);
    expect((await withTelegram('/api/runs/run-1/started', json({ courseId: 'deauville-2026-half', source: 'app' }))).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('tells of an uploaded run once, however often the queue sends it again', async () => {
    const { token } = (await (await SELF.fetch('http://run.test/api/auth/verify', json({ ...MARC, code: env.TEST_CODE }))).json()) as { token: string };
    const run = RunSchema.parse({
      id: 'run-telegram', entrantId: 'deauville-2026-1001', courseId: 'deauville-2026-half', status: 'finished', source: 'app',
      startedAt: '2026-11-14T08:00:00+01:00', finishedAt: '2026-11-14T09:45:30+01:00', elapsedMs: 6_330_000, distanceM: 21_150,
    });
    const put = () => withTelegram(`/api/runs/${run.id}`, json({ run }, { Authorization: `Bearer ${token}` }, 'PUT'));
    expect((await put()).status).toBe(200);
    expect((await put()).status).toBe(200);
    expect(sent.map((s) => s.text)).toEqual(['[local] 🏁 Marc DUPONT (dossard 1001, Marathon International de Deauville, test) a couru 21,1 km en 1:45:30 : officiel']);
  });
});
