import { buildScript, manifestFor, packPrefix, renderableLines } from '@sivoov/shared';
import type { AudioScript, RenderedFile } from '@sivoov/shared';
import type { Db } from '../db/queries';
import type { ScriptDb } from '../db/scriptQueries';
import { sha256HexBytes } from './crypto';
import { ttsHash, ttsKey } from './tts';

export type PublishOutcome =
  | { ok: true; version: number; files: number; bytes: number }
  | { ok: false; missing: { id: string; title: string }[] };

/**
 * Publishing turns the draft into the pack the app downloads: every rendered line is copied
 * from the `tts/` cache to `packs/<courseId>/<version>/<key>.mp3`, the manifest lands beside
 * them and in `audio_packs`, and the draft moves on to the next version. Packs are immutable
 * per version (the audio route caches them for a year), so nothing published is ever touched.
 */
export const publishScript = async (
  deps: { db: Db; scripts: ScriptDb; files: R2Bucket },
  script: AudioScript,
): Promise<PublishOutcome> => {
  const built = buildScript(script);
  const lines = renderableLines(script);
  const found = await Promise.all(
    lines.map(async (line) => {
      const object = await deps.files.get(ttsKey(await ttsHash(script.voice, line.text)));
      return { line, object };
    }),
  );
  const missing = found.filter((f) => f.object === null).map((f) => ({ id: f.line.id, title: f.line.title }));
  if (missing.length > 0) return { ok: false, missing };

  const prefix = packPrefix(script.courseId, script.version);
  const rendered: RenderedFile[] = await Promise.all(
    found.map(async ({ line, object }): Promise<RenderedFile> => {
      const body = await object!.arrayBuffer();
      const key = `${line.key}.mp3`;
      await deps.files.put(`${prefix}/${key}`, body, { httpMetadata: { contentType: 'audio/mpeg' } });
      return { key, bytes: body.byteLength, sha256: await sha256HexBytes(body) };
    }),
  );

  const pack = manifestFor(built, rendered);
  await deps.files.put(`${prefix}/manifest.json`, JSON.stringify(pack), { httpMetadata: { contentType: 'application/json' } });
  await deps.db.upsertAudioPack(pack);
  await deps.scripts.saveDraft({ ...script, version: script.version + 1 });
  return { ok: true, version: pack.version, files: rendered.length, bytes: rendered.reduce((n, r) => n + r.bytes, 0) };
};
