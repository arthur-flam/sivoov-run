/** Where in the window the words being said sit: a little above its middle, so the next line shows. */
const READ_AT = 0.4;

/** How far to scroll the words up: `from` now, to `to` after `delayMs` then `durationMs`, evenly. */
export type CaptionScroll = { from: number; to: number; delayMs: number; durationMs: number };

/**
 * The scroll of a caption longer than its window, in step with its sound: the words advance
 * as the voice says them, taken as spoken at an even rate. It waits while the first lines are
 * said, then moves so the spoken line stays near the window's top third, and stops with the
 * last line in view. Pure: the caption animates it.
 */
export const captionScroll = ({ contentH, windowH, elapsedMs, durationMs }: { contentH: number; windowH: number; elapsedMs: number; durationMs: number }): CaptionScroll => {
  const max = Math.max(0, contentH - windowH);
  if (max === 0 || durationMs <= 0) return { from: 0, to: 0, delayMs: 0, durationMs: 0 };
  const lead = windowH * READ_AT;
  // The fraction of the sound at which the scroll starts, and the one at which it is done.
  const begin = lead / contentH;
  const end = (max + lead) / contentH;
  const at = Math.min(1, Math.max(0, elapsedMs / durationMs));
  const offset = Math.min(max, Math.max(0, at * contentH - lead));
  return { from: offset, to: max, delayMs: Math.max(0, (begin - at) * durationMs), durationMs: Math.max(0, (end - Math.max(at, begin)) * durationMs) };
};
