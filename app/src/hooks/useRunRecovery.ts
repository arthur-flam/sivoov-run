import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { diag } from '@/diag';
import { useRun } from '@/stores/run';
import { closeRun, findRun } from '@/stores/runRecovery';

/** Once per launch of the app: coming back to the home screen later is the runner's own choice. */
let checked = false;

/**
 * When the app opens on a run that did not end properly, the runner lands back in it. A run still
 * alive in memory (Android rebuilt the screens but the app never died) is simply shown again; a
 * run from the journal that can go on opens the run screen, which offers to resume it; a run that
 * is over is queued for upload without a word.
 */
export const useRunRecovery = (entrantId: string | null, token: string | null): void => {
  const router = useRouter();
  useEffect(() => {
    if (!entrantId || checked) return;
    checked = true;
    const phase = useRun.getState().phase;
    if (phase === 'running' || phase === 'countdown') {
      router.push('/run');
      return;
    }
    void findRun(entrantId)
      .then(async (found) => {
        if (!found) return;
        if (found.recovery.kind === 'resume') return router.push('/run');
        await closeRun(found, token);
      })
      .catch((e: unknown) => diag('run', `recovery failed: ${e instanceof Error ? e.message : String(e)}`));
  }, [entrantId, token, router]);
};
