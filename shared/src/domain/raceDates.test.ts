import { describe, expect, it } from 'vitest';
import { raceDateProblems } from './raceDates';

const deauville = { dateStart: '2026-11-14', dateEnd: '2026-11-15', windowStart: '2026-11-09T00:00:00+01:00', windowEnd: '2026-11-15T23:59:59+01:00' };

describe('the dates of a race', () => {
  it('are fine in order, and for a race of one day', () => {
    expect(raceDateProblems(deauville)).toEqual([]);
    expect(raceDateProblems({ ...deauville, dateEnd: '2026-11-14' })).toEqual([]);
  });
  it('flag a race that ends before it starts', () => {
    expect(raceDateProblems({ ...deauville, dateEnd: '2026-11-13' })).toEqual(['dateEnd']);
  });
  it('flag a window that closes before it opens, or as it opens', () => {
    expect(raceDateProblems({ ...deauville, windowEnd: '2026-11-08T23:00:00+01:00' })).toEqual(['windowEnd']);
    expect(raceDateProblems({ ...deauville, windowEnd: deauville.windowStart })).toEqual(['windowEnd']);
  });
  it('compare instants, not the text: the same moment written with two offsets is the same', () => {
    expect(raceDateProblems({ ...deauville, windowStart: '2026-11-09T00:00:00+01:00', windowEnd: '2026-11-08T23:30:00Z' })).toEqual([]);
  });
});
