import { contrastRatio } from './contrast';

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
  Array.from({ length: 21 }, (_, i) => mixWithWhite(color, i / 20)).find((c) => (contrastRatio(c, background) ?? 0) >= minContrast) ?? '#ffffff';
