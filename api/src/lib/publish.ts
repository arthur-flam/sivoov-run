import { AUDIO_CONTENT_TYPES, buildScript, lineIssues, manifestFor, packFileKey, packPrefix, personalDefsFor, underFileKey, voiceFormat } from '@sivoov/shared';
import type { AudioScript, RenderedFile, ScriptLine } from '@sivoov/shared';
import type { Db } from '../db/queries';
import type { ScriptDb } from '../db/scriptQueries';
import { sha256HexBytes } from './crypto';
import { storeDefs } from './personal';
import { scriptFingerprint } from './studio';
import { renderKey, ttsHash } from './tts';
import { uploadKey } from './uploads';
import { mapLimit } from './mapLimit';

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
  // Heads first (no bodies held open), then the copies a few at a time: a Worker may keep only
  // six connections open, and a pack has dozens of files.
  const sources = [
    ...(await Promise.all(built.lines.map(async (line) => ({ line, key: await sourceKey(built, line), under: false })))),
    ...built.lines.filter((l) => l.under).map((line) => ({ line, key: uploadKey(line.under!), under: true })),
  ];
  const heads = await mapLimit(sources, 6, async (src) => ({ ...src, found: (await deps.files.head(src.key)) !== null }));
  const missing = heads.filter((h) => !h.found).map((h) => ({ id: h.line.id, title: h.line.title }));
  if (missing.length > 0) return { ok: false, reason: 'missing', missing };

  const prefix = packPrefix(script.courseId, script.version);
  const rendered: RenderedFile[] = await mapLimit(sources, 4, async ({ line, key, under }): Promise<RenderedFile> => {
    const format = under ? line.under!.format : (line.audio?.format ?? voiceFormat(built.voice));
    const fileKey = under ? underFileKey(line)! : packFileKey(line, format);
    const object = await deps.files.get(key);
    if (!object) throw new Error(`${key} vanished while publishing`);
    const body = await object.arrayBuffer();
    await deps.files.put(`${prefix}/${fileKey}`, body, { httpMetadata: { contentType: AUDIO_CONTENT_TYPES[format] } });
    return { key: fileKey, bytes: body.byteLength, sha256: await sha256HexBytes(body) };
  });

  const pack = manifestFor(built, rendered);
  const defs = personalDefsFor(built);
  if (defs.lines.length > 0) await storeDefs(deps.files, defs);
  await deps.files.put(`${prefix}/manifest.json`, JSON.stringify(pack), { httpMetadata: { contentType: 'application/json' } });
  await deps.db.upsertAudioPack(pack);
  const published = { version: pack.version, at: now.toISOString(), fingerprint: await scriptFingerprint(script) };
  await deps.scripts.saveDraft({ ...script, version: script.version + 1, published });
  return { ok: true, version: pack.version, files: rendered.length, bytes: rendered.reduce((n, r) => n + r.bytes, 0) };
};
