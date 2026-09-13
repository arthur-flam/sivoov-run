import { beforeEach, describe, expect, it, vi } from 'vitest';
import { idleRun } from '@sivoov/shared';

const memory = new Map<string, string>();
vi.mock('@/storage', () => ({
  storage: {
    get: async (k: string) => memory.get(k) ?? null,
    set: async (k: string, v: string) => void memory.set(k, v),
    remove: async (k: string) => void memory.delete(k),
  },
}));
const uploadRun = vi.fn();
vi.mock('@/api', () => ({ api: { uploadRun: (...args: unknown[]) => uploadRun(...args) } }));

const { UPLOADS_KEY, newRunId, toUpload, useUploads } = await import('./uploads');

const finishedState = { ...idleRun(5000), phase: 'finished' as const, startedAt: 1_700_000_000_000, elapsedMs: 1_500_000.4, distanceM: 5000, splits: [{ km: 1, elapsedMs: 300_000, splitMs: 300_000 }] };
const upload = (id: string) =>
  toUpload({
    id,
    entrantId: 'e1',
    courseId: 'c1',
    state: finishedState,
    samples: [{ lat: 49.36, lng: 0.07, timestamp: 1_700_000_000_000 }],
    fired: [{ eventId: 'gun', key: 'ceremony.start', distanceM: 0, elapsedMs: 0.2 }],
    source: 'app',
    device: { platform: 'ios', osVersion: '19' },
    finishedAtMs: 1_700_001_500_000,
  });

describe('uploads queue', () => {
  beforeEach(() => {
    memory.clear();
    uploadRun.mockReset();
    useUploads.setState({ hydrated: false, pending: [], sent: [], flushing: false });
  });

  it('builds a finished run and its trace from the run store state', () => {
    const u = upload('r1');
    expect(u.run).toMatchObject({ status: 'finished', elapsedMs: 1_500_000, distanceM: 5000, startedAt: '2023-11-14T22:13:20.000Z', device: { platform: 'ios' } });
    expect(u.trace.audioFired).toEqual([{ eventId: 'gun', distanceM: 0, elapsedMs: 0 }]);
    expect(newRunId(1)).toMatch(/^1-[a-z0-9]{8}$/);
  });

  it('sends right away with a token and remembers the run as sent', async () => {
    uploadRun.mockResolvedValue({ ok: true });
    await useUploads.getState().enqueue(upload('r1'), 'tok');
    expect(uploadRun).toHaveBeenCalledWith('tok', expect.objectContaining({ id: 'r1' }), expect.objectContaining({ runId: 'r1' }));
    expect(useUploads.getState().statusOf('r1')).toBe('sent');
    expect(JSON.parse(memory.get(UPLOADS_KEY)!)).toEqual({ pending: [], sent: ['r1'] });
  });

  it('keeps a failed upload pending, persisted, and sends it on the next flush', async () => {
    uploadRun.mockRejectedValueOnce(new Error('offline'));
    await useUploads.getState().enqueue(upload('r2'), 'tok');
    expect(useUploads.getState().statusOf('r2')).toBe('pending');
    expect(useUploads.getState().pending[0]).toMatchObject({ attempts: 1, lastError: 'offline' });

    // A fresh store (app restart) hydrates the queue from storage and retries.
    useUploads.setState({ hydrated: false, pending: [], sent: [] });
    uploadRun.mockResolvedValue({ ok: true });
    await useUploads.getState().flush('tok');
    expect(uploadRun).toHaveBeenCalledTimes(2);
    expect(useUploads.getState().statusOf('r2')).toBe('sent');
    expect(useUploads.getState().pending).toHaveLength(0);
  });

  it('queues without a token and reports unknown runs as such', async () => {
    await useUploads.getState().enqueue(upload('r3'));
    expect(uploadRun).not.toHaveBeenCalled();
    expect(useUploads.getState().statusOf('r3')).toBe('pending');
    expect(useUploads.getState().statusOf('nope')).toBe('unknown');
  });
});
