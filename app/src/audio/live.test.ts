import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEventSchema, idleRun, startRun } from '@sivoov/shared';
import type { LiveVoiceRequest, RunState } from '@sivoov/shared';

/** The phone's cache dir: file uri -> downloaded. `stalled` urls never finish downloading. */
const disk = new Set<string>();
const stalled = new Set<string>();
const platform = { OS: 'android' };
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-file-system', () => {
  const pathOf = (p: unknown): string => (typeof p === 'string' ? p : (p as { path: string }).path);
  class Directory {
    path: string;
    constructor(...parts: unknown[]) {
      this.path = parts.map(pathOf).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(dir: Directory, name: string) {
      this.uri = `file://${dir.path}/${name}`;
    }
    get exists() {
      return disk.has(this.uri);
    }
    delete() {
      disk.delete(this.uri);
    }
    static async downloadFileAsync(url: string, file: File) {
      if (stalled.has(url)) return new Promise<File>(() => undefined);
      disk.add(file.uri);
      return file;
    }
  }
  return { Directory, File, Paths: { cache: { path: 'cache' }, document: { path: 'document' } } };
});

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
const liveVoice = vi.fn<(token: string, req: LiveVoiceRequest) => Promise<{ url: string; bytes: number; caption?: string }>>();
vi.mock('@/api', () => ({ ApiError, LIVE_VOICE_TIMEOUT_MS: 7000, api: { liveVoice: (token: string, req: LiveVoiceRequest) => liveVoice(token, req) } }));

const { liveSound, resetLiveLines } = await import('./live');

const pack = { courseId: 'deauville-2026-marathon', version: 3 };
const split = AudioEventSchema.parse({
  id: 'personal.split',
  trigger: { kind: 'split', everyMeters: 5000 },
  source: { kind: 'file', key: 'split.mp3' },
  category: 'personal',
  personal: { phase: 'live' },
});
const atKm10: RunState = { ...startRun(idleRun(42_195), 0), distanceM: 10_020, elapsedMs: 3_300_000, avgPaceSecPerKm: 329.4 };
const voice = { url: 'https://run.test/api/voices/f00.mp3', bytes: 9000, caption: 'Kilomètre dix, cinquante-cinq minutes.' };

describe('a live line', () => {
  beforeEach(() => {
    liveVoice.mockReset();
    disk.clear();
    stalled.clear();
    platform.OS = 'android';
    resetLiveLines();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('is asked for with what the run knows at that moment, and played from a file on the phone', async () => {
    liveVoice.mockResolvedValue(voice);
    expect(await liveSound(pack, split, atKm10, 'token')).toMatchObject({ url: 'file://cache/live/f00.mp3', caption: 'Kilomètre dix, cinquante-cinq minutes.' });
    expect(liveVoice).toHaveBeenCalledWith('token', { ...pack, eventId: 'personal.split', facts: { km: 10, elapsedS: 3300, paceSecPerKm: 329, projectedS: 13897 } });
  });

  it('asks for the take the engine chose by its id, when that take is said live', async () => {
    liveVoice.mockResolvedValue(voice);
    const pool = AudioEventSchema.parse({
      ...split,
      personal: undefined,
      takes: [
        { id: 'b', key: 'split~b.mp3', personal: { phase: 'live' } },
        { id: 'c', key: 'split~c.mp3', personal: { phase: 'prepare' } },
      ],
    });
    expect(await liveSound(pack, pool, atKm10, 'token', 'b')).toMatchObject({ url: 'file://cache/live/f00.mp3' });
    expect(liveVoice).toHaveBeenCalledWith('token', expect.objectContaining({ eventId: 'personal.split', take: 'b' }));
    // The line's own words and a take made before the start are not live lines.
    expect(await liveSound(pack, pool, atKm10, 'token')).toBeNull();
    expect(await liveSound(pack, pool, atKm10, 'token', 'c')).toBeNull();
    expect(liveVoice).toHaveBeenCalledTimes(1);
  });

  it('streams it on the web, which keeps no files', async () => {
    platform.OS = 'web';
    liveVoice.mockResolvedValue(voice);
    expect(await liveSound(pack, split, atKm10, 'token')).toMatchObject({ url: voice.url });
  });

  it('gives way to the offline file without a network, a session or a live phase', async () => {
    liveVoice.mockRejectedValue(new Error('timeout'));
    expect(await liveSound(pack, split, atKm10, 'token')).toBeNull();
    expect(await liveSound(pack, split, atKm10, null)).toBeNull();
    expect(await liveSound(pack, { ...split, personal: { phase: 'prepare' } }, atKm10, 'token')).toBeNull();
    expect(liveVoice).toHaveBeenCalledTimes(1);
  });

  it('gives way to the offline file when its file does not come down within the same seven seconds', async () => {
    liveVoice.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return voice;
    });
    stalled.add(voice.url);
    const said = liveSound(pack, split, atKm10, 'token');
    await vi.advanceTimersByTimeAsync(3000);
    let settled = false;
    void said.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(3900);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(await said).toBeNull();
  });

  it('is not asked for during five minutes after two network failures in a row', async () => {
    liveVoice.mockRejectedValue(new Error('timeout'));
    await liveSound(pack, split, atKm10, 'token');
    await liveSound(pack, split, atKm10, 'token');
    liveVoice.mockResolvedValue(voice);
    expect(await liveSound(pack, split, atKm10, 'token')).toBeNull();
    expect(liveVoice).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5 * 60_000);
    expect(await liveSound(pack, split, atKm10, 'token')).not.toBeNull();
    expect(liveVoice).toHaveBeenCalledTimes(3);
  });

  it('keeps asking when the server answers but refuses a line (a value missing): the network is there', async () => {
    liveVoice.mockRejectedValue(new ApiError(422, 'missing_value'));
    await liveSound(pack, split, atKm10, 'token');
    await liveSound(pack, split, atKm10, 'token');
    await liveSound(pack, split, atKm10, 'token');
    expect(liveVoice).toHaveBeenCalledTimes(3);
  });
});
