import type { RunStart } from '@sivoov/shared';
import { api } from '@/api';
import { useRun } from '@/stores/run';
import { useSession } from '@/stores/session';

type Phase = ReturnType<typeof useRun.getState>['phase'];

/** The gun: the countdown gives way to the run. A run coming back goes from 'recovered', and is no start. */
export const isGun = (prev: Phase, next: Phase): boolean => prev === 'countdown' && next === 'running';

/**
 * Tells the Worker at each gun, for the owner's Telegram line: which course, and whether it is a
 * simulation (the same rule as the upload). Fire and forget: never awaited, never in the run's
 * way; offline, it is simply lost. Watches the run store rather than living in it, so the store
 * needs no network. Returns the unsubscribe.
 */
export const watchGun = (): (() => void) =>
  useRun.subscribe((next, prev) => {
    const token = useSession.getState().token;
    if (!isGun(prev.phase, next.phase) || !next.course || !token) return;
    const start: RunStart = { courseId: next.course.id, source: next.source?.kind === 'simulation' ? 'simulation' : 'app' };
    void api.runStarted(token, next.runId, start).catch(() => undefined);
  });
