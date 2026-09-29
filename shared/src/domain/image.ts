/**
 * Pictures an organizer sends for their race: the logo and the header photo. PNG, JPEG or WebP,
 * recognised from the file's first bytes (never from its name or declared type), so an SVG, which
 * can carry script, never gets in under another name.
 */

export type ImageKind = 'png' | 'jpeg' | 'webp';
export type ImageSlot = 'logo' | 'hero';
/** The size limits: the race's slots, and a runner's photo for a photo moment (the page shrinks it first). */
export type ImageLimit = ImageSlot | 'selfie';

export const IMAGE_TYPES: Record<ImageKind, { contentType: string; ext: string }> = {
  png: { contentType: 'image/png', ext: 'png' },
  jpeg: { contentType: 'image/jpeg', ext: 'jpg' },
  webp: { contentType: 'image/webp', ext: 'webp' },
};

const MB = 1024 * 1024;
/** Largest file accepted per slot, in bytes: 2 MB for a logo, 5 MB for a photo, 8 MB for a runner's photo sent straight from a phone. */
export const IMAGE_MAX_BYTES: Record<ImageLimit, number> = { logo: 2 * MB, hero: 5 * MB, selfie: 8 * MB };

const startsWith = (bytes: Uint8Array, at: number, expected: readonly number[]): boolean => expected.every((b, i) => bytes[at + i] === b);
const ascii = (text: string): number[] => [...text].map((ch) => ch.charCodeAt(0));

/** What the bytes are, or null when they are not a PNG, a JPEG or a WebP. */
export const sniffImage = (bytes: Uint8Array): ImageKind | null => {
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, 0, ascii('RIFF')) && startsWith(bytes, 8, ascii('WEBP'))) return 'webp';
  return null;
};

export type ImageCheck = { ok: true; kind: ImageKind } | { ok: false; error: 'empty' | 'type' | 'too_big' };

/** Can these bytes be the race's logo (or photo)? */
export const checkImage = (bytes: Uint8Array, slot: ImageLimit): ImageCheck => {
  if (bytes.length === 0) return { ok: false, error: 'empty' };
  const kind = sniffImage(bytes);
  if (!kind) return { ok: false, error: 'type' };
  if (bytes.length > IMAGE_MAX_BYTES[slot]) return { ok: false, error: 'too_big' };
  return { ok: true, kind };
};

/**
 * A JPEG without its APP1 segments (EXIF and XMP: where and when it was taken, the phone). A
 * runner's photo goes to an image model: it needs the pixels, nothing else. Anything that is not
 * a well-formed JPEG comes back as it was.
 */
export const stripJpegMetadata = (bytes: Uint8Array): Uint8Array => {
  if (sniffImage(bytes) !== 'jpeg') return bytes;
  const keep: Array<[number, number]> = [[0, 2]];
  const walk = (at: number): number | null => {
    if (at + 4 > bytes.length || bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    // Start of scan: the image data runs to the end, kept whole.
    if (marker === 0xda) return at;
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (length < 2 || at + 2 + length > bytes.length) return null;
    if (marker !== 0xe1) keep.push([at, at + 2 + length]);
    return walk(at + 2 + length);
  };
  const scan = walk(2);
  if (scan === null) return bytes;
  keep.push([scan, bytes.length]);
  const out = new Uint8Array(keep.reduce((n, [a, b]) => n + b - a, 0));
  keep.reduce((offset, [a, b]) => {
    out.set(bytes.subarray(a, b), offset);
    return offset + b - a;
  }, 0);
  return out;
};
