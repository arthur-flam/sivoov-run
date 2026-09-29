/**
 * A circuit breaker for the live lines. Each live line waits up to 7 s for the network before
 * its offline version plays; in a valley with no signal every split would be 7 s late. After
 * `failures` failures in a row the live lines are not asked for during `pauseMs`: the offline
 * versions play at once. After the pause one line tries again; one more failure pauses again,
 * a success closes it. Pure.
 */
export type Breaker = { failures: number; openUntil: number | null };

export type BreakerRule = { failures: number; pauseMs: number };

export const LIVE_BREAKER: BreakerRule = { failures: 2, pauseMs: 5 * 60_000 };

export const closedBreaker: Breaker = { failures: 0, openUntil: null };

/** Whether a live line may be asked for now. */
export const allows = (breaker: Breaker, now: number): boolean => breaker.openUntil === null || now >= breaker.openUntil;

/** The breaker after an attempt that succeeded or failed at `now`. */
export const afterAttempt = (breaker: Breaker, ok: boolean, now: number, rule: BreakerRule = LIVE_BREAKER): Breaker => {
  if (ok) return closedBreaker;
  const failures = breaker.failures + 1;
  return { failures, openUntil: failures >= rule.failures ? now + rule.pauseMs : null };
};
