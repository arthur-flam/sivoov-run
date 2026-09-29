import { LocationSampleSchema } from '../schemas/run';
import type { LocationSample } from '../schemas/run';
import type { RunJournal } from '../schemas/runJournal';
import { applySample, idleRun, startRun } from './tracker';
import type { RunState, TrackerConfig } from './tracker';
import { DEFAULT_TRACKER } from './tracker';

/**
 * A run survives the app. The phone journals every fix as it arrives; when the app comes back
 * after being killed, crashing or the phone restarting, the run is rebuilt by replaying those
 * fixes through the same tracker (the tracker is a pure fold, so the replay is the run), and
 * the runner either carries on or closes it.
 */

/** Longer than any runner's day: a journal this old is never resumed, and nothing keeps the GPS on for it. */
export const MAX_RUN_MS = 8 * 60 * 60_000;
/**
 * A run carries on by itself when the app comes back (only the runner's stop ends it), unless
 * nothing came from it for this long: past two hours, whoever reopens the app is not running it.
 */
export const RESUME_WITHIN_MS = 2 * 60 * 60_000;

/** One fix as a line of the samples file. */
export const journalLine = (sample: LocationSample): string => `${JSON.stringify(sample)}\n`;

const parseLine = (line: string): LocationSample[] => {
  try {
    const parsed = LocationSampleSchema.safeParse(JSON.parse(line));
    return parsed.success ? [parsed.data] : [];
  } catch {
    return [];
  }
};

/**
 * The samples file back as fixes, in time order, one per instant. A process killed mid-write
 * leaves half a line at the end: it is dropped, like any line that does not parse. The same fix
 * can be written twice (the background task and the run both saw it around a resume).
 */
export const parseJournalSamples = (text: string): LocationSample[] =>
  text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap(parseLine)
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((sample, i, all) => i === 0 || sample.timestamp !== all[i - 1]!.timestamp);

/** The run as it stood at its last fix: the journal's gun, then every fix through the tracker. */
export const replayRun = (journal: Pick<RunJournal, 'targetM' | 'startedAt'>, samples: readonly LocationSample[], config: TrackerConfig = DEFAULT_TRACKER): RunState =>
  samples.reduce((state, sample) => applySample(state, sample, config), startRun(idleRun(journal.targetM), journal.startedAt));

/** When the run last showed a sign of life: its last fix or its last write. */
export const lastActivityAt = (journal: Pick<RunJournal, 'updatedAt'>, samples: readonly LocationSample[]): number =>
  Math.max(journal.updatedAt, samples[samples.length - 1]?.timestamp ?? 0);

/**
 * What to do with a journal found when the app starts. 'resume': the runner is very likely still
 * out there, the run carries on (the clock kept running, as it does in a race). 'close': the run
 * is over one way or another (stopped, finished, or silent for too long): it is uploaded as it
 * stands, finished if its fixes covered the distance, abandoned otherwise.
 */
export type Recovery = { kind: 'resume' | 'close'; state: RunState };

export const recoveryFor = (journal: RunJournal, samples: readonly LocationSample[], now: number): Recovery => {
  const state = replayRun(journal, samples);
  const over =
    journal.stoppedAt !== undefined ||
    state.phase === 'finished' ||
    now - lastActivityAt(journal, samples) > RESUME_WITHIN_MS ||
    now - journal.startedAt > MAX_RUN_MS;
  return { kind: over ? 'close' : 'resume', state };
};

/**
 * Fixes reaching the background task with no run listening: the app was killed or crashed while
 * the phone kept the GPS going (Android restarts its location service). 'keep' journals them for
 * the run to pick up when it comes back; 'stop' switches a GPS nobody will ever read off (no run,
 * a stopped one, or one older than any race), which would otherwise drain the phone.
 */
export const orphanFixes = (journal: Pick<RunJournal, 'startedAt' | 'stoppedAt'> | null, now: number): 'keep' | 'stop' =>
  journal !== null && journal.stoppedAt === undefined && now - journal.startedAt < MAX_RUN_MS ? 'keep' : 'stop';
