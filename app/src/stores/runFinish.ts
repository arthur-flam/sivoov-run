import { diag, useDiag } from '@/diag';
import { useRun } from '@/stores/run';
import { deviceInfo } from '@/stores/runRecovery';
import { useSession } from '@/stores/session';
import { toUpload, useUploads } from '@/stores/uploads';

type Phase = ReturnType<typeof useRun.getState>['phase'];

/** The line (or the runner's stop): the run turns 'finished', from whatever it was. */
export const isFinish = (prev: Phase, next: Phase): boolean => prev !== 'finished' && next === 'finished';

/**
 * The finish path, whichever screen is on, or none (Android dropped the screens and the run went
 * on in the background): the run and its trace go in the upload queue, then its journal goes, then
 * the queue is sent (now, or when back online). A queue that could not take the run keeps the
 * journal, and the next start sends it (`closeRun`). Returns the unsubscribe.
 */
export const watchFinish = (): (() => void) =>
  useRun.subscribe((next, prev) => {
    if (!isFinish(prev.phase, next.phase)) return;
    const { me, token } = useSession.getState();
    if (!me || !next.course) return;
    const { state, samples, fired, source, runId, course } = next;
    diag('run', `finished: ${state.accepted} accepted, ${state.rejected} rejected, ${samples.length} samples, ${Math.round(state.distanceM)} m`);
    const upload = toUpload({
      id: runId,
      entrantId: me.entrant.id,
      courseId: course.id,
      state,
      samples,
      fired,
      source: source?.kind === 'simulation' ? 'simulation' : 'app',
      device: deviceInfo(),
      finishedAtMs: source?.now() ?? Date.now(),
      diagnostics: useDiag.getState().snapshot(),
    });
    void useUploads
      .getState()
      .enqueue(upload, null)
      .then(async () => {
        await useRun.getState().forget();
        if (token) await useUploads.getState().flush(token);
      })
      .catch((e: unknown) => diag('run', `queueing ${runId} failed, its journal stays: ${e instanceof Error ? e.message : String(e)}`));
  });
