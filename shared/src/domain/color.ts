/** WCAG relative luminance of a #rrggbb colour. */
const luminance = (hex: string): number => {
  const channel = (i: number) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

/** WCAG contrast ratio between two #rrggbb colours, 1 to 21. */
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const mixWithWhite = (hex: string, amount: number): string =>
  `#${[1, 3, 5]
    .map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) + (255 - parseInt(hex.slice(i, i + 2), 16)) * amount))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;

/**
 * The race colour, lifted toward white just enough to read on a dark ground. A navy race
 * accent is invisible on the night run screen; this keeps its hue and makes it a line you
 * can see through sweat. 3:1 is the WCAG floor for graphics and large text.
 */
export const readableOn = (color: string, background: string, minContrast = 3): string =>
  Array.from({ length: 21 }, (_, i) => mixWithWhite(color, i / 20)).find((c) => contrastRatio(c, background) >= minContrast) ?? '#ffffff';
