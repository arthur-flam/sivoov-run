import { z } from 'zod';

/**
 * A run in progress, as the phone keeps it on disk so that a killed app, a crash or a phone
 * restarted mid-race loses nothing. The fixes themselves are appended to a separate file, one
 * JSON sample per line (`journalLine`); this is the small part rewritten as the run goes.
 */
export const RunJournalSchema = z.object({
  version: z.literal(1),
  runId: z.string().min(1),
  entrantId: z.string().min(1),
  courseId: z.string().min(1),
  /** The course's official distance, meters. */
  targetM: z.number().positive(),
  /** The gun, epoch ms: the clock of a resumed run never stopped. */
  startedAt: z.number().int().nonnegative(),
  /** Epoch ms of the last write: a fix, a line fired, a resume. */
  updatedAt: z.number().int().nonnegative(),
  /**
   * The lines already dealt with, so a resumed run does not say them twice; `missed` ones fell due
   * while the phone was dark. `take`: the take said, so a resumed run keeps going round the pool.
   */
  fired: z.array(
    z.object({
      eventId: z.string(),
      key: z.string(),
      take: z.string().optional(),
      distanceM: z.number().nonnegative(),
      elapsedMs: z.number().nonnegative(),
      missed: z.boolean().optional(),
    }),
  ),
  /** Set when the runner stopped (or the finish was reached): the upload is all that is left. */
  stoppedAt: z.number().int().nonnegative().optional(),
});
export type RunJournal = z.infer<typeof RunJournalSchema>;
