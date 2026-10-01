import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idleRun } from '@sivoov/shared';

/** The run store as the finish watcher reads it. */
vi.mock('@/stores/run', async () => {
  const { create } = await import('zustand');
  return { useRun: create(() => ({ phase: 'idle', runId: 'run-1', course: { id: 'course-1' }, source: { kind: 'device', now: () => 1_700_001_500_000 }, samples: [], fired: [], forget: vi.fn(async () => undefined) })) };
});
const session = vi.hoisted(() => ({ token: 'tok' as string | null, me: { entrant: { id: 'e1' } } as { entrant: { id: string } } | null }));
vi.mock('@/stores/session', () => ({ useSession: { getState: () => session } }));
vi.mock('@/stores/runRecovery', () => ({ deviceInfo: () => ({ platform: 'android', osVersion: '16' }) }));
vi.mock('@/diag', () => ({ diag: () => undefined, useDiag: { getState: () => ({ snapshot: () => undefined }) } }));
const enqueue = vi.fn();
const flush = vi.fn();
vi.mock('@/stores/uploads', () => ({ toUpload: (input: unknown) => ({ input }), useUploads: { getState: () => ({ enqueue, flush }) } }));

const { useRun } = await import('@/stores/run');
const { watchFinish } = await import('./runFinish');

const finished = { ...idleRun(5000), phase: 'finished' as const, startedAt: 1_700_000_000_000, elapsedMs: 1_500_000, distanceM: 5000 };
const set = (state: Record<string, unknown>) => (useRun.setState as unknown as (s: Record<string, unknown>) => void)(state);
const forget = () => (useRun.getState() as unknown as { forget: ReturnType<typeof vi.fn> }).forget;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a finish reaches the upload queue, with or without the run screen', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    session.token = 'tok';
    enqueue.mockReset().mockResolvedValue(undefined);
    flush.mockReset().mockResolvedValue(undefined);
    forget().mockClear();
    set({ phase: 'running', state: idleRun(5000) });
    stop = watchFinish();
  });
  afterEach(() => stop());

  it('queues the run once at the finish, clears its journal, then sends it', async () => {
    set({ phase: 'finished', state: finished });
    set({ phase: 'finished', state: finished });
    await settle();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0]).toEqual([{ input: expect.objectContaining({ id: 'run-1', entrantId: 'e1', courseId: 'course-1', state: finished, source: 'app' }) }, null]);
    expect(forget()).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledWith('tok');
  });

  it('keeps the journal when the queue could not take the run (a full phone): the next start sends it', async () => {
    enqueue.mockRejectedValue(new Error('ENOSPC'));
    set({ phase: 'finished', state: finished });
    await settle();
    expect(forget()).not.toHaveBeenCalled();
  });
});
