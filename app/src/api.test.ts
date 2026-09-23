import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { apiUrl: 'http://api.test' } } } }));
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
});
