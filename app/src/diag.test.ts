import { beforeEach, describe, expect, it } from 'vitest';
import { RunDiagnosticsSchema } from '@sivoov/shared';
import { MAX_LINES, diag, diagCount, useDiag } from './diag';

describe('diag', () => {
  beforeEach(() => useDiag.getState().clear());

  it('keeps lines in order with the tag that wrote them', () => {
    diag('location', 'task fired');
    diag('upload', 'sent');
    expect(useDiag.getState().lines.map((l) => [l.tag, l.message])).toEqual([
      ['location', 'task fired'],
      ['upload', 'sent'],
    ]);
  });

  it('bounds the buffer and never drops a line silently', () => {
    Array.from({ length: MAX_LINES + 25 }, (_, i) => diag('location', `fix ${i}`));
    const { lines, dropped } = useDiag.getState();
    expect(lines).toHaveLength(MAX_LINES);
    expect(dropped).toBe(25);
    // The oldest survivor is line 25: the head went, the tail is what matters after a run.
    expect(lines[0]!.message).toBe('fix 25');
    expect(lines.at(-1)!.message).toBe(`fix ${MAX_LINES + 24}`);
  });

  it('tallies counters without writing a line per event', () => {
    diagCount('task.batches');
    diagCount('task.fixes', 8);
    diagCount('task.fixes', 4);
    expect(useDiag.getState().counters).toEqual({ 'task.batches': 1, 'task.fixes': 12 });
    expect(useDiag.getState().lines).toHaveLength(0);
  });

  it('snapshots into something the shared schema accepts', () => {
    diag('run', 'gun');
    diagCount('task.fixes', 3);
    expect(() => RunDiagnosticsSchema.parse(useDiag.getState().snapshot())).not.toThrow();
  });

  it('starts empty again after a clear, so one run never inherits the last', () => {
    diag('run', 'gun');
    useDiag.getState().clear();
    expect(useDiag.getState().snapshot()).toEqual({ counters: {}, lines: [], dropped: 0 });
  });
});
