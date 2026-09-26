import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEventSchema, idleRun, startRun } from '@sivoov/shared';
import type { LiveVoiceRequest, RunState } from '@sivoov/shared';

const liveVoice = vi.fn<(token: string, req: LiveVoiceRequest) => Promise<{ url: string; bytes: number }>>();
vi.mock('@/api', () => ({ api: { liveVoice: (token: string, req: LiveVoiceRequest) => liveVoice(token, req) } }));

const { liveSound } = await import('./live');

const pack = { courseId: 'deauville-2026-marathon', version: 3 };
const split = AudioEventSchema.parse({
  id: 'personal.split',
  trigger: { kind: 'split', everyMeters: 5000 },
  source: { kind: 'file', key: 'split.mp3' },
  category: 'personal',
  personal: { phase: 'live' },
});
const atKm10: RunState = { ...startRun(idleRun(42_195), 0), distanceM: 10_020, elapsedMs: 3_300_000, avgPaceSecPerKm: 329.4 };

describe('a live line', () => {
  beforeEach(() => {
    liveVoice.mockReset();
  });

  it('is asked for with what the run knows at that moment, and played from the answer', async () => {
    liveVoice.mockResolvedValue({ url: 'https://run.test/api/voices/f00.mp3', bytes: 9000 });
    expect(await liveSound(pack, split, atKm10, 'token')).toBe('https://run.test/api/voices/f00.mp3');
    expect(liveVoice).toHaveBeenCalledWith('token', { ...pack, eventId: 'personal.split', facts: { km: 10, elapsedS: 3300, paceSecPerKm: 329, projectedS: 13897 } });
  });

  it('gives way to the offline file without a network, a session or a live phase', async () => {
    liveVoice.mockRejectedValue(new Error('timeout'));
    expect(await liveSound(pack, split, atKm10, 'token')).toBeNull();
    expect(await liveSound(pack, split, atKm10, null)).toBeNull();
    expect(await liveSound(pack, { ...split, personal: { phase: 'prepare' } }, atKm10, 'token')).toBeNull();
    expect(liveVoice).toHaveBeenCalledTimes(1);
  });
});
