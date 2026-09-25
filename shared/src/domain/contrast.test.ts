import { describe, expect, it } from 'vitest';
import { READABLE_CONTRAST, contrastRatio, isReadable, relativeLuminance } from './contrast';

describe('contrast between race colors', () => {
  it('runs from 1 for the same color to 21 for black on white, in either order', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
  });
  it('matches the published WCAG figures', () => {
    expect(relativeLuminance('#FFFFFF')).toBe(1);
    expect(relativeLuminance('#000000')).toBe(0);
    // #767676 is the lightest grey that passes on white; #777777 just fails.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
  it('finds white on Deauville blue readable and yellow on white hard to read', () => {
    expect(isReadable('#ffffff', '#0f3d6e')).toBe(true);
    expect(isReadable('#ffff00', '#ffffff')).toBe(false);
    expect(isReadable('#767676', '#ffffff')).toBe(true);
    expect(READABLE_CONTRAST).toBe(4.5);
  });
  it('has no ratio for something that is not a color', () => {
    expect(contrastRatio('red', '#ffffff')).toBeNull();
    expect(contrastRatio('#fff', '#ffffff')).toBeNull();
    expect(isReadable('red', '#ffffff')).toBe(false);
  });
});
