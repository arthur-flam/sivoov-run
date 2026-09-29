/**
 * A fix's time, trusted unless it is absurd. The tracker drops fixes stamped before the gun and
 * times the run on fix timestamps, so a receiver whose clock is years off (the GPS week rollover
 * bug of some older chipsets reports dates 19.6 years back) would record nothing at all. Batches
 * legitimately arrive a little late, so only a timestamp further than `toleranceMs` from the
 * moment it reached the app is replaced by that moment.
 */
export const FIX_CLOCK_TOLERANCE_MS = 10 * 60_000;

export const fixTime = (fixMs: number, receivedMs: number, toleranceMs = FIX_CLOCK_TOLERANCE_MS): number =>
  Math.abs(fixMs - receivedMs) > toleranceMs ? Math.round(receivedMs) : Math.round(fixMs);
