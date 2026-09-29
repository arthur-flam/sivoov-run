import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { abandon, lastActivityAt, recoveryFor } from '@sivoov/shared';
import type { DeviceInfo, LocationSample, Recovery, RunJournal } from '@sivoov/shared';
import { diag, useDiag } from '@/diag';
import { journalFiles } from './journalFiles';
import { toUpload, useUploads } from './uploads';

/** The phone as the upload describes it. */
export const deviceInfo = (): DeviceInfo => ({
  platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
  osVersion: String(Platform.Version ?? ''),
  appVersion: Constants.expoConfig?.version,
});

export type FoundRun = { journal: RunJournal; samples: LocationSample[]; recovery: Recovery };

/**
 * The run left on the phone by this runner, if any, and what to do with it (`recoveryFor`). A run
 * of another entrant (someone else signed in on this phone since) is left for them.
 */
export const findRun = async (entrantId: string, now = Date.now()): Promise<FoundRun | null> => {
  const found = await journalFiles.read().catch(() => null);
  if (!found || found.journal.entrantId !== entrantId) return null;
  return { ...found, recovery: recoveryFor(found.journal, found.samples, now) };
};

/**
 * A run that is over (stopped, finished, or silent too long to resume): queued for upload as it
 * stood, finished if its fixes covered the distance, abandoned otherwise; then its journal goes.
 */
export const closeRun = async ({ journal, samples, recovery }: FoundRun, token: string | null): Promise<void> => {
  const state = recovery.state.phase === 'running' ? abandon(recovery.state) : recovery.state;
  diag('run', `closing ${journal.runId} from its journal: ${state.phase}, ${Math.round(state.distanceM)} m, ${samples.length} fixes`);
  const upload = toUpload({
    id: journal.runId,
    entrantId: journal.entrantId,
    courseId: journal.courseId,
    state,
    samples,
    fired: journal.fired,
    source: 'app',
    device: deviceInfo(),
    finishedAtMs: journal.stoppedAt ?? lastActivityAt(journal, samples),
    diagnostics: useDiag.getState().snapshot(),
  });
  // The trace is on file in the upload queue before the journal goes: a crash in between loses nothing.
  await useUploads.getState().enqueue(upload, null);
  await journalFiles.clear();
  if (token) await useUploads.getState().flush(token).catch(() => undefined);
};
