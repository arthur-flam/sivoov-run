import { afterEach, describe, expect, it, vi } from 'vitest';
import { notify, sendTelegram } from './telegram';

const TOKEN = '123456:secret-bot-token';
const env = { ENVIRONMENT: 'preview' as const, TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '42' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('telegram sender', () => {
  it('posts plain text to the chat, with the environment and no link preview', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    await sendTelegram(env, '🔑 Connexion de <b>Léa</b> & co');
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    // No parse mode: the text goes as typed, markup and all, and cannot break the message.
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: '42', text: '[preview] 🔑 Connexion de <b>Léa</b> & co', disable_web_page_preview: true });
  });

  it('does nothing without the token or the chat', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await sendTelegram({ ...env, TELEGRAM_BOT_TOKEN: '' }, 'x');
    await sendTelegram({ ...env, TELEGRAM_CHAT_ID: undefined }, 'x');
    const waitUntil = vi.fn();
    notify({ env: { ENVIRONMENT: 'local' }, executionCtx: { waitUntil } }, 'x');
    expect(fetch).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('never throws: a refusal or a network failure is a warning, and the token never reaches the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', async () => new Response('{"ok":false,"description":"Bad Request: chat not found"}', { status: 400 }));
    await expect(sendTelegram(env, 'x')).resolves.toBeUndefined();
    vi.stubGlobal('fetch', async () => {
      throw new Error(`connect failed for https://api.telegram.org/bot${TOKEN}/sendMessage`);
    });
    await expect(sendTelegram(env, 'x')).resolves.toBeUndefined();
    const logged = warn.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('answered 400');
    expect(logged).toContain('connect failed');
    expect(logged).not.toContain(TOKEN);
  });

  it('sends after the response, through the request’s waitUntil', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })));
    const waitUntil = vi.fn();
    notify({ env, executionCtx: { waitUntil } }, 'x');
    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]![0];
  });
});
