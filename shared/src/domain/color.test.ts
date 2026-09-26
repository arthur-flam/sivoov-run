import { describe, expect, it } from 'vitest';
import { readableOn } from './color';
import { contrastRatio } from './contrast';

const NIGHT = '#0c0c0c';

describe('race colours on the night screens', () => {
  it('lifts a navy race colour until it reads on the dark run screen', () => {
    expect(contrastRatio('#0f3d6e', NIGHT)).toBeLessThan(3);
    const lifted = readableOn('#0f3d6e', NIGHT);
    expect(contrastRatio(lifted, NIGHT)!).toBeGreaterThanOrEqual(3);
    // Still the race's blue, not a grey.
    const [r, , b] = [1, 3, 5].map((i) => parseInt(lifted.slice(i, i + 2), 16)) as [number, number, number];
    expect(b).toBeGreaterThan(r);
  });
  it('leaves a colour that already reads alone', () => {
    expect(readableOn('#e8786f', NIGHT)).toBe('#e8786f');
  });
});
