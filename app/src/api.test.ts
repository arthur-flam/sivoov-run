import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '2.0.0', extra: { apiUrl: 'http://api.test' } } } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android', Version: 36, constants: { Release: '16', Brand: 'samsung', Model: 'SM-S911B' } } }));
const { api } = await import('./api');

describe('api client', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives up on a request that hangs, so the upload queue is never stuck', async () => {
    // A fetch that only ends when aborted, like a stalled phone connection.
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const pending = api.me('tok');
    const outcome = expect(pending).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(20_000);
    await outcome;
  });

  it('tells the server it is the app, which version, and on which phone', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.signOut('tok');
    const headers = fetchMock.mock.calls[0]?.[1].headers as Record<string, string>;
    expect(headers['X-Sivoov-Client']).toBe('app/2.0.0 (android 16; samsung SM-S911B)');
    expect(headers.Authorization).toBe('Bearer tok');
  });
});
