import { describe, expect, it } from 'vitest';
import { IMAGE_MAX_BYTES, checkImage, sniffImage, stripJpegMetadata } from './image';

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
  it('may weigh up to 2 MB for a logo, 5 MB for a photo, 8 MB for a runner’s selfie', () => {
    const sized = (n: number) => {
      const b = new Uint8Array(n);
      b.set(PNG);
      return b;
    };
    expect(checkImage(sized(IMAGE_MAX_BYTES.logo), 'logo')).toEqual({ ok: true, kind: 'png' });
    expect(checkImage(sized(IMAGE_MAX_BYTES.logo + 1), 'logo')).toEqual({ ok: false, error: 'too_big' });
    expect(checkImage(sized(IMAGE_MAX_BYTES.logo + 1), 'hero')).toEqual({ ok: true, kind: 'png' });
    expect(checkImage(sized(IMAGE_MAX_BYTES.hero + 1), 'hero')).toEqual({ ok: false, error: 'too_big' });
    expect(checkImage(sized(IMAGE_MAX_BYTES.hero + 1), 'selfie')).toEqual({ ok: true, kind: 'png' });
    expect(IMAGE_MAX_BYTES).toEqual({ logo: 2 * 1024 * 1024, hero: 5 * 1024 * 1024, selfie: 8 * 1024 * 1024 });
  });
});

describe('a runner’s photo on its way to the image model', () => {
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
  const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
  const jpeg = (...parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat()]);
  const scan = [0xff, 0xda, 0, 4, 1, 2, 9, 9, 9, 0xff, 0xd9];

  it('loses its EXIF (where it was taken) and keeps everything else', () => {
    const exif = segment(0xe1, [...ascii('Exif'), 0, 0, 42, 42]);
    const jfif = segment(0xe0, ascii('JFIF'));
    const quant = segment(0xdb, [0, 1, 2, 3]);
    expect([...stripJpegMetadata(jpeg(jfif, exif, quant, scan))]).toEqual([...jpeg(jfif, quant, scan)]);
  });
  it('comes back as it was when it is not a JPEG or is broken', () => {
    expect(stripJpegMetadata(PNG)).toBe(PNG);
    const broken = jpeg([0xff, 0xe1, 0xff, 0xff, 1]);
    expect(stripJpegMetadata(broken)).toBe(broken);
  });
});
