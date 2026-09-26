import { describe, expect, it } from 'vitest';
import { IMAGE_MAX_BYTES, checkImage, sniffImage } from './image';

const bytes = (...parts: Array<number[] | string>): Uint8Array =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13]);
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF');
const WEBP = bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ');
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe('a picture sent for a race', () => {
  it('is recognised from its first bytes', () => {
    expect(sniffImage(PNG)).toBe('png');
    expect(sniffImage(JPEG)).toBe('jpeg');
    expect(sniffImage(WEBP)).toBe('webp');
  });
  it('is refused when it is an SVG, a GIF, a PDF or a RIFF that is not WebP', () => {
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(bytes('GIF89a'))).toBeNull();
    expect(sniffImage(bytes('%PDF-1.7'))).toBeNull();
    expect(sniffImage(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))).toBeNull();
    expect(checkImage(SVG, 'logo')).toEqual({ ok: false, error: 'type' });
  });
  it('is refused when empty', () => {
    expect(checkImage(new Uint8Array(0), 'logo')).toEqual({ ok: false, error: 'empty' });
  });
  it('may weigh up to 2 MB for a logo and 5 MB for a photo', () => {
    const sized = (n: number) => {
      const b = new Uint8Array(n);
      b.set(PNG);
      return b;
    };
    expect(checkImage(sized(IMAGE_MAX_BYTES.logo), 'logo')).toEqual({ ok: true, kind: 'png' });
    expect(checkImage(sized(IMAGE_MAX_BYTES.logo + 1), 'logo')).toEqual({ ok: false, error: 'too_big' });
    expect(checkImage(sized(IMAGE_MAX_BYTES.logo + 1), 'hero')).toEqual({ ok: true, kind: 'png' });
    expect(checkImage(sized(IMAGE_MAX_BYTES.hero + 1), 'hero')).toEqual({ ok: false, error: 'too_big' });
    expect(IMAGE_MAX_BYTES).toEqual({ logo: 2 * 1024 * 1024, hero: 5 * 1024 * 1024 });
  });
});
