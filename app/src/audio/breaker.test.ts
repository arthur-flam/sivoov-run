import { describe, expect, it } from 'vitest';
import { LIVE_BREAKER, afterAttempt, allows, closedBreaker } from './breaker';

const MIN = 60_000;
const run = (outcomes: [boolean, number][]) => outcomes.reduce((b, [ok, at]) => afterAttempt(b, ok, at), closedBreaker);

describe('the live lines’ breaker', () => {
  it('lets live lines through while the network answers', () => {
    const b = run([
      [true, 0],
      [false, MIN],
      [true, 2 * MIN],
      [false, 3 * MIN],
    ]);
    expect(allows(b, 3 * MIN)).toBe(true);
  });

  it('stops asking for five minutes after two failures in a row: the offline lines play at once', () => {
    const b = run([
      [false, 0],
      [false, MIN],
    ]);
    expect(LIVE_BREAKER).toEqual({ failures: 2, pauseMs: 5 * MIN });
    expect(allows(b, MIN + 1)).toBe(false);
    expect(allows(b, 5 * MIN)).toBe(false);
    expect(allows(b, 6 * MIN)).toBe(true);
  });

  it('pauses again at once when the try after the pause fails, and closes on a success', () => {
    const paused = run([
      [false, 0],
      [false, MIN],
      [false, 6 * MIN],
    ]);
    expect(allows(paused, 6 * MIN + 1)).toBe(false);
    expect(allows(paused, 11 * MIN)).toBe(true);
    expect(afterAttempt(paused, true, 11 * MIN)).toEqual(closedBreaker);
  });
});
