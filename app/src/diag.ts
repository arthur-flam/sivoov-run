import { create } from 'zustand';
import { RunDiagnosticsSchema } from '@sivoov/shared';
import type { RunDiagnostics } from '@sivoov/shared';

/**
 * The phone's own logbook. A run outdoors has no cable and no `adb logcat`, so anything
 * worth knowing afterwards has to be written here: it is shown on `/debug` and it travels
 * to R2 inside the run's trace (docs/WORKFLOW.md, loop 2b).
 *
 * Bounded on purpose — a marathon must not grow it without limit.
 */
export const MAX_LINES = 400;

type DiagStore = RunDiagnostics & {
  /** Epoch ms the buffer started, so `atMs` offsets can be read back as wall clock. */
  startedAtMs: number;
  log: (tag: string, message: string) => void;
  /** Tally without a line: called per GPS batch, where a line each would drown the rest. */
  count: (name: string, by?: number) => void;
  snapshot: () => RunDiagnostics;
  clear: () => void;
};

const empty = () => ({ counters: {}, lines: [], dropped: 0, startedAtMs: Date.now() });

export const useDiag = create<DiagStore>((set, get) => ({
  ...empty(),

  log(tag, message) {
    const { lines, dropped, startedAtMs } = get();
    const next = [...lines, { atMs: Math.max(0, Date.now() - startedAtMs), tag, message }];
    const over = Math.max(0, next.length - MAX_LINES);
    set({ lines: next.slice(over), dropped: dropped + over });
  },

  count(name, by = 1) {
    const { counters } = get();
    set({ counters: { ...counters, [name]: (counters[name] ?? 0) + by } });
  },

  snapshot() {
    const { counters, lines, dropped } = get();
    return RunDiagnosticsSchema.parse({ counters, lines, dropped });
  },

  clear() {
    set(empty());
  },
}));

/** Call sites stay short: `diag('location', 'task fired')`. */
export const diag = (tag: string, message: string): void => useDiag.getState().log(tag, message);
export const diagCount = (name: string, by = 1): void => useDiag.getState().count(name, by);
