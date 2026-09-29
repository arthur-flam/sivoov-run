import { describe, expect, it } from 'vitest';
import { captionScroll } from './captionScroll';

describe('a long caption scrolls as the voice says it', () => {
  it('does not move when the words fit', () => {
    expect(captionScroll({ contentH: 60, windowH: 69, elapsedMs: 0, durationMs: 10_000 })).toEqual({ from: 0, to: 0, delayMs: 0, durationMs: 0 });
  });

  it('waits while the first lines are said, then brings the last one into view by the end', () => {
    // Ten lines of 23 px in a window of three, over 20 s.
    const scroll = captionScroll({ contentH: 230, windowH: 69, elapsedMs: 0, durationMs: 20_000 });
    expect(scroll.from).toBe(0);
    expect(scroll.to).toBe(161);
    expect(scroll.delayMs).toBeCloseTo(2400, 0);
    expect(scroll.delayMs + scroll.durationMs).toBeLessThan(20_000);
    expect(scroll.delayMs + scroll.durationMs).toBeGreaterThan(16_000);
  });

  it('starts from where the voice is when the words are measured late', () => {
    const scroll = captionScroll({ contentH: 230, windowH: 69, elapsedMs: 10_000, durationMs: 20_000 });
    expect(scroll.from).toBeCloseTo(115 - 27.6, 5);
    expect(scroll.delayMs).toBe(0);
  });

  it('shows the end once the voice is done', () => {
    expect(captionScroll({ contentH: 230, windowH: 69, elapsedMs: 25_000, durationMs: 20_000 })).toMatchObject({ from: 161, to: 161, durationMs: 0 });
  });
});
