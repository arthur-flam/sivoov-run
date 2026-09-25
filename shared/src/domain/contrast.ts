/**
 * Is text in one color readable on another? The WCAG 2 contrast ratio, from 1 (same color) to
 * 21 (black on white). The admin warns an organizer whose race colors fall under
 * `READABLE_CONTRAST`, the level WCAG asks of ordinary text.
 */

export const READABLE_CONTRAST = 4.5;

const HEX_RE = /^#([0-9a-f]{6})$/i;

/** sRGB channel (0-255) -> its linear light value. */
const linear = (channel: number): number => {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance of "#rrggbb", 0 for black to 1 for white; null for anything else. */
export const relativeLuminance = (hex: string): number | null => {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Contrast between two "#rrggbb" colors, in either order; null when one is not a color. */
export const contrastRatio = (a: string, b: string): number | null => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** True when text in `text` reads well on `background`. */
export const isReadable = (text: string, background: string): boolean => (contrastRatio(text, background) ?? 0) >= READABLE_CONTRAST;
