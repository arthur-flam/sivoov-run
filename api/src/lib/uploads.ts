import { AUDIO_CONTENT_TYPES, MAX_AUDIO_UPLOAD_BYTES, UploadedAudioSchema, sniffAudioFormat } from '@sivoov/shared';
import type { ScriptLine, UploadedAudio } from '@sivoov/shared';
import { sha256HexBytes } from './crypto';

/**
 * The organizer's own sound files (their voice, a crowd, a bell), one per line at most. Stored
 * in R2 by content hash at `studio-uploads/<sha256>.<format>`, so a file uploaded twice is
 * stored once and a line only records the hash. Private to the organizer session until a
 * publish copies the file into the pack, exactly like a rendered voice.
 */
export const UPLOAD_PREFIX = 'studio-uploads/';
export const uploadKey = (audio: Pick<UploadedAudio, 'hash' | 'format'>): string => `${UPLOAD_PREFIX}${audio.hash}.${audio.format}`;

export type UploadError = 'empty' | 'too_big' | 'not_audio';
export type UploadOutcome = { ok: true; audio: UploadedAudio } | { ok: false; error: UploadError };

/** Checks the file is a sound the phones can play (by its bytes, not its name), then stores it. */
export const storeUpload = async (files: R2Bucket, name: string, body: ArrayBuffer): Promise<UploadOutcome> => {
  if (body.byteLength === 0) return { ok: false, error: 'empty' };
  if (body.byteLength > MAX_AUDIO_UPLOAD_BYTES) return { ok: false, error: 'too_big' };
  const format = sniffAudioFormat(new Uint8Array(body.slice(0, 64)));
  if (!format) return { ok: false, error: 'not_audio' };
  const audio = UploadedAudioSchema.parse({ kind: 'upload', hash: await sha256HexBytes(body), format, bytes: body.byteLength, name: name.slice(0, 200) });
  const key = uploadKey(audio);
  if (!(await files.head(key))) await files.put(key, body, { httpMetadata: { contentType: AUDIO_CONTENT_TYPES[format] } });
  return { ok: true, audio };
};

/** Lines pointing at a file that is not in R2: a draft may only name files the Worker stored. */
export const missingUploads = async (files: R2Bucket, lines: ScriptLine[]): Promise<ScriptLine[]> => {
  const checked = await Promise.all(lines.map(async (line) => ({ line, found: line.audio ? (await files.head(uploadKey(line.audio))) !== null : true })));
  return checked.filter((c) => !c.found).map((c) => c.line);
};
