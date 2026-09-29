import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The run store as the screens see it: only what the gun watcher reads. */
vi.mock('@/stores/run', async () => {
  const { create } = await import('zustand');
  return { useRun: create(() => ({ phase: 'idle', runId: 'run-1', course: { id: 'course-1' }, source: { kind: 'device' } })) };
});
const session = vi.hoisted(() => ({ token: 'tok' as string | null }));
vi.mock('@/stores/session', () => ({ useSession: { getState: () => session } }));
const runStarted = vi.fn();
vi.mock('@/api', () => ({ api: { runStarted: (...args: unknown[]) => runStarted(...args) } }));

const { useRun } = await import('@/stores/run');
const { watchGun } = await import('./runStarted');

type Fake = { phase: string; runId?: string; source?: { kind: string } };
const set = (state: Fake) => (useRun.setState as unknown as (s: Fake) => void)(state);

describe('the gun reaches the Worker', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    session.token = 'tok';
    runStarted.mockReset().mockResolvedValue({ ok: true });
    set({ phase: 'idle', runId: 'run-1', source: { kind: 'device' } });
    stop = watchGun();
  });
  afterEach(() => stop());

  it('tells of a start once, at the gun, with the run, its course and whether it is a simulation', () => {
    set({ phase: 'countdown' });
    expect(runStarted).not.toHaveBeenCalled();
    set({ phase: 'running', runId: 'run-2' });
    set({ phase: 'running' });
    expect(runStarted.mock.calls).toEqual([['tok', 'run-2', { courseId: 'course-1', source: 'app' }]]);
    set({ phase: 'idle' });
    set({ phase: 'countdown', source: { kind: 'simulation' } });
    set({ phase: 'running', runId: 'run-3' });
    expect(runStarted.mock.calls[1]).toEqual(['tok', 'run-3', { courseId: 'course-1', source: 'simulation' }]);
  });

  it('says nothing when a run comes back, or when nobody is signed in', () => {
    set({ phase: 'recovered' });
    set({ phase: 'running' });
    session.token = null;
    set({ phase: 'countdown' });
    set({ phase: 'running' });
    expect(runStarted).not.toHaveBeenCalled();
  });

  it('never gets in the run’s way when the Worker cannot be reached', async () => {
    runStarted.mockRejectedValue(new Error('timeout'));
    set({ phase: 'countdown' });
    expect(() => set({ phase: 'running' })).not.toThrow();
    await Promise.resolve();
    expect(runStarted).toHaveBeenCalledOnce();
  });
});
