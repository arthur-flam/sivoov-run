import { AUDIO_CONTENT_TYPES, buildScript, lineIssues, manifestFor, packFileKey, packPrefix, personalDefsFor, underFileKey, voiceFormat } from '@sivoov/shared';
import type { AudioScript, RenderedFile, ScriptLine } from '@sivoov/shared';
import type { Db } from '../db/queries';
import type { ScriptDb } from '../db/scriptQueries';
import { sha256HexBytes } from './crypto';
import { storeDefs } from './personal';
import { scriptFingerprint } from './studio';
import { renderKey, ttsHash } from './tts';
import { uploadKey } from './uploads';

/** `fix`: a line has nothing to read or something to correct. `missing`: a line's sound is not there yet. */
export type PublishOutcome =
  | { ok: true; version: number; files: number; bytes: number }
  | { ok: false; reason: 'fix' | 'missing'; missing: { id: string; title: string }[] };

/** The sentence the admin shows when a publish is refused. */
export const refusalText = (outcome: Extract<PublishOutcome, { ok: false }>): string => {
  const names = outcome.missing.map((m) => m.title || m.id).join(', ');
  return outcome.reason === 'fix' ? `Annonces à compléter avant de publier : ${names}.` : `Il manque le son de : ${names}.`;
};

/** Where a line's sound waits before publishing: the organizer's upload, or the voice cache for its text. */
const sourceKey = async (script: AudioScript, line: ScriptLine): Promise<string> =>
  line.audio ? uploadKey(line.audio) : renderKey(script.voice, await ttsHash(script.voice, line.text));

/**
 * Publishing turns the draft into the pack the app downloads: every line's sound (the rendered
 * voice from the `tts/` cache, or the organizer's own file from `studio-uploads/`; for a
 * personal line, its offline version) is copied to `packs/<courseId>/<version>/<key>.<ext>`,
 * the manifest lands beside them and in `audio_packs`, the personal lines' definitions go to
 * `personal-defs/` (private: the runners' own versions are made from them), and the draft moves
 * on to the next version, remembering what it published. Packs are immutable per version (the
 * audio route caches them for a year), so nothing published is ever touched.
 */
export const publishScript = async (deps: { db: Db; scripts: ScriptDb; files: R2Bucket }, script: AudioScript, now: Date = new Date()): Promise<PublishOutcome> => {
  const built = buildScript(script);
  const toFix = built.lines.filter((l) => lineIssues(l).length > 0).map((l) => ({ id: l.id, title: l.title }));
  if (toFix.length > 0) return { ok: false, reason: 'fix', missing: toFix };
  const found = await Promise.all(built.lines.map(async (line) => ({ line, object: await deps.files.get(await sourceKey(built, line)) })));
  const unders = await Promise.all(
    built.lines.filter((l) => l.under).map(async (line) => ({ line, object: await deps.files.get(uploadKey(line.under!)) })),
  );
  const missing = [...found, ...unders].filter((f) => f.object === null).map((f) => ({ id: f.line.id, title: f.line.title }));
  if (missing.length > 0) return { ok: false, reason: 'missing', missing };

  const prefix = packPrefix(script.courseId, script.version);
  const copy = async (key: string, object: R2ObjectBody, contentType: string): Promise<RenderedFile> => {
    const body = await object.arrayBuffer();
    await deps.files.put(`${prefix}/${key}`, body, { httpMetadata: { contentType } });
    return { key, bytes: body.byteLength, sha256: await sha256HexBytes(body) };
  };
  const rendered: RenderedFile[] = await Promise.all([
    ...found.map(({ line, object }) => {
      const format = line.audio?.format ?? voiceFormat(built.voice);
      return copy(packFileKey(line, format), object!, AUDIO_CONTENT_TYPES[format]);
    }),
    ...unders.map(({ line, object }) => copy(underFileKey(line)!, object!, AUDIO_CONTENT_TYPES[line.under!.format])),
  ]);

  const pack = manifestFor(built, rendered);
  const defs = personalDefsFor(built);
  if (defs.lines.length > 0) await storeDefs(deps.files, defs);
  await deps.files.put(`${prefix}/manifest.json`, JSON.stringify(pack), { httpMetadata: { contentType: 'application/json' } });
  await deps.db.upsertAudioPack(pack);
  const published = { version: pack.version, at: now.toISOString(), fingerprint: await scriptFingerprint(script) };
  await deps.scripts.saveDraft({ ...script, version: script.version + 1, published });
  return { ok: true, version: pack.version, files: rendered.length, bytes: rendered.reduce((n, r) => n + r.bytes, 0) };
};
