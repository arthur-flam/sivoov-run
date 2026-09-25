import { IMAGE_MAX_BYTES, IMAGE_TYPES, checkImage } from '@sivoov/shared';
import type { ImageKind, ImageSlot } from '@sivoov/shared';
import type { Bindings } from '../env';
import { sha256HexBytes } from './crypto';

/**
 * A race's pictures (logo, header photo) live in R2 under `races/<raceId>/<sha256>.<ext>`: the
 * same file sent twice is stored once, and a new file gets a new address, so `GET /media/<key>`
 * can be cached for a year. The race theme keeps the absolute URL (RaceThemeSchema wants URLs).
 */

/** Keys `/media` will serve: pictures of a race, and nothing else in the bucket. */
export const MEDIA_KEY_RE = /^races\/[a-z0-9-]+\/[a-f0-9]{64}\.(png|jpg|webp)$/;

const KIND_BY_EXT: Record<string, ImageKind> = { png: 'png', jpg: 'jpeg', webp: 'webp' };
export const contentTypeForKey = (key: string): string | null => {
  const kind = KIND_BY_EXT[key.split('.').pop() ?? ''];
  return kind ? IMAGE_TYPES[kind].contentType : null;
};

export const mediaUrl = (baseUrl: string, key: string): string => `${baseUrl.replace(/\/+$/, '')}/media/${key}`;

export type StoredImage = { ok: true; url: string } | { ok: false; error: 'empty' | 'type' | 'too_big' };

/** Checks the bytes (PNG, JPEG or WebP, size per slot), stores them and returns their public URL. */
export const storeRaceImage = async (env: Bindings, raceId: string, slot: ImageSlot, file: File): Promise<StoredImage> => {
  // Refuse a huge file before reading it into memory.
  if (file.size > IMAGE_MAX_BYTES[slot]) return { ok: false, error: 'too_big' };
  const buffer = await file.arrayBuffer();
  const check = checkImage(new Uint8Array(buffer), slot);
  if (!check.ok) return check;
  const type = IMAGE_TYPES[check.kind];
  const key = `races/${raceId}/${await sha256HexBytes(buffer)}.${type.ext}`;
  await env.FILES.put(key, buffer, { httpMetadata: { contentType: type.contentType, cacheControl: 'public, max-age=31536000, immutable' } });
  return { ok: true, url: mediaUrl(env.BASE_URL, key) };
};
