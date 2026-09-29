import type { LocationSample, RunJournal } from '@sivoov/shared';
import { diag, diagCount } from '@/diag';
import { journalFiles } from './journalFiles';

type Files = Pick<typeof journalFiles, 'open' | 'writeMeta' | 'append'>;
/** A fired line as the run store has it (with `silent`, which the journal does not keep). */
type FiredRecord = RunJournal['fired'][number] & { silent?: boolean };

/** Fixes are written in small batches: a crash costs at most this much of the run (bridged by a straight line). */
export const FLUSH_EVERY_MS = 10_000;

/**
 * Writes the run in progress as it goes (`journalFiles`). Never throws and never holds the run
 * up: a failed write is logged and the run carries on, it only loses its safety net.
 */
export const createJournalWriter = (files: Files = journalFiles, now: () => number = () => Date.now(), flushEveryMs = FLUSH_EVERY_MS) => {
  let journal: RunJournal | null = null;
  let buffer: LocationSample[] = [];
  let flushedAt = 0;
  /** Writes happen one after the other: an append overtaking the `open` that empties the file would be lost. */
  let queue: Promise<void> = Promise.resolve();

  const safely = (what: string, write: () => Promise<void>): Promise<void> => {
    queue = queue.then(write).catch((e: unknown) => {
      diagCount('journal.failed');
      diag('journal', `${what} failed: ${e instanceof Error ? e.message : String(e)}`);
    });
    return queue;
  };

  const flush = (): Promise<void> => {
    const batch = buffer;
    buffer = [];
    flushedAt = now();
    return batch.length === 0 ? queue : safely('append', () => files.append(batch));
  };

  const saveMeta = (patch: Partial<RunJournal>): Promise<void> => {
    if (!journal) return queue;
    const next: RunJournal = { ...journal, ...patch, updatedAt: now() };
    journal = next;
    return safely('meta', () => files.writeMeta(next));
  };

  return {
    /** A new run: its journal replaces whatever was there. */
    open(opened: RunJournal, samples: readonly LocationSample[] = []): Promise<void> {
      journal = opened;
      buffer = [];
      flushedAt = now();
      return safely('open', async () => {
        await files.open(opened);
        await files.append(samples);
      });
    },
    /** A journal already on disk carries on (a resumed run): nothing is rewritten. */
    adopt(existing: RunJournal): Promise<void> {
      journal = existing;
      buffer = [];
      flushedAt = now();
      return saveMeta({});
    },
    add(sample: LocationSample): void {
      if (!journal) return;
      buffer = [...buffer, sample];
      if (now() - flushedAt >= flushEveryMs) void flush();
    },
    fired(records: readonly FiredRecord[]): Promise<void> {
      return saveMeta({ fired: records.map(({ eventId, key, distanceM, elapsedMs, missed }) => ({ eventId, key, distanceM, elapsedMs, ...(missed ? { missed } : {}) })) });
    },
    /** The runner stopped or the finish was reached: what is left is the upload. */
    async stop(at: number): Promise<void> {
      if (!journal) return;
      await flush();
      await saveMeta({ stoppedAt: at });
    },
    /** Forgets the run without touching the disk (the journal is cleared once its upload is queued). */
    close(): Promise<void> {
      journal = null;
      buffer = [];
      return queue;
    },
    flush,
    isOpen: (): boolean => journal !== null,
  };
};

export type JournalWriter = ReturnType<typeof createJournalWriter>;
