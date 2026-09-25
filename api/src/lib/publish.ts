import { AUDIO_CONTENT_TYPES, buildScript, manifestFor, packFileKey, packPrefix } from '@sivoov/shared';
import type { AudioScript, RenderedFile, ScriptLine } from '@sivoov/shared';
import type { Db } from '../db/queries';
import type { ScriptDb } from '../db/scriptQueries';
import { sha256HexBytes } from './crypto';
import { scriptFingerprint } from './studio';
import { ttsHash, ttsKey } from './tts';
import { uploadKey } from './uploads';

export type PublishOutcome =
  | { ok: true; version: number; files: number; bytes: number }
  | { ok: false; missing: { id: string; title: string }[] };

/** Where a line's sound waits before publishing: the organizer's upload, or the voice cache for its text. */
const sourceKey = async (script: AudioScript, line: ScriptLine): Promise<string> =>
  line.audio ? uploadKey(line.audio) : ttsKey(await ttsHash(script.voice, line.text));

/**
 * Publishing turns the draft into the pack the app downloads: every line with a sound (the
 * rendered voice from the `tts/` cache, or the organizer's own file from `studio-uploads/`) is
 * copied to `packs/<courseId>/<version>/<key>.<ext>`, the manifest lands beside them and in
 * `audio_packs`, and the draft moves on to the next version, remembering what it published.
 * Packs are immutable per version (the audio route caches them for a year), so nothing
 * published is ever touched. Template lines (slots, no file) stay caption-only in the app.
 */
export const publishScript = async (deps: { db: Db; scripts: ScriptDb; files: R2Bucket }, script: AudioScript, now: Date = new Date()): Promise<PublishOutcome> => {
  const built = buildScript(script);
  const withSound = script.lines.filter((l) => l.audio || !l.slots);
  const found = await Promise.all(withSound.map(async (line) => ({ line, object: await deps.files.get(await sourceKey(script, line)) })));
  const missing = found.filter((f) => f.object === null).map((f) => ({ id: f.line.id, title: f.line.title }));
  if (missing.length > 0) return { ok: false, missing };

  const prefix = packPrefix(script.courseId, script.version);
  const rendered: RenderedFile[] = await Promise.all(
    found.map(async ({ line, object }): Promise<RenderedFile> => {
      const body = await object!.arrayBuffer();
      const key = packFileKey(line);
      await deps.files.put(`${prefix}/${key}`, body, { httpMetadata: { contentType: AUDIO_CONTENT_TYPES[line.audio?.format ?? 'mp3'] } });
      return { key, bytes: body.byteLength, sha256: await sha256HexBytes(body) };
    }),
  );

  const pack = manifestFor(built, rendered);
  await deps.files.put(`${prefix}/manifest.json`, JSON.stringify(pack), { httpMetadata: { contentType: 'application/json' } });
  await deps.db.upsertAudioPack(pack);
  const published = { version: pack.version, at: now.toISOString(), fingerprint: await scriptFingerprint(script) };
  await deps.scripts.saveDraft({ ...script, version: script.version + 1, published });
  return { ok: true, version: pack.version, files: rendered.length, bytes: rendered.reduce((n, r) => n + r.bytes, 0) };
};
