import { describe, expect, it } from 'vitest';
import { fixTime } from './fixClock';

const now = Date.UTC(2026, 10, 14, 9, 0, 0);

describe("a fix's time", () => {
  it('is the receiver\'s own, even when the batch reached the app a few seconds late', () => {
    expect(fixTime(now - 4000, now)).toBe(now - 4000);
  });

  it("is the moment it arrived when the receiver's clock is absurd (GPS week rollover: 1024 weeks back)", () => {
    const rolledOver = now - 1024 * 7 * 24 * 3600_000;
    expect(fixTime(rolledOver, now)).toBe(now);
  });

  it('comes in whole milliseconds (iOS reports fractions)', () => {
    expect(fixTime(now + 0.4, now)).toBe(now);
  });
});
