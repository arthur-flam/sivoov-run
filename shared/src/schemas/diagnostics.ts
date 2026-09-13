import { z } from 'zod';

/**
 * What the phone saw, in the phone's own words. Without a laptop there is no `adb logcat`,
 * so the device keeps a small ring buffer and ships it with the run (docs/WORKFLOW.md,
 * loop 2b). It is the only way a cloud session can tell "Android sent no fixes" from
 * "the background task never reached JS".
 */
export const DiagLineSchema = z.object({
  /** Milliseconds since the buffer was created, so a line is readable without a clock. */
  atMs: z.number().int().nonnegative(),
  /** Where it came from: `location`, `upload`, `audio`, `run`. */
  tag: z.string().min(1),
  message: z.string(),
});
export type DiagLine = z.infer<typeof DiagLineSchema>;

export const RunDiagnosticsSchema = z.object({
  /** Free-form tallies: `task.batches`, `task.fixes`, `task.dropped`, `upload.failed`. */
  counters: z.record(z.string(), z.number()).default({}),
  lines: z.array(DiagLineSchema).default([]),
  /** Lines dropped from the head of the ring buffer, so truncation is never silent. */
  dropped: z.number().int().nonnegative().default(0),
});
export type RunDiagnostics = z.infer<typeof RunDiagnosticsSchema>;
