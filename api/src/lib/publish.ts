import { AUDIO_CONTENT_TYPES, audioSeconds, buildScript, lineIssues, manifestFor, packPrefix, personalDefsFor, underFileKey, voiceFormat, voicingsOf } from '@sivoov/shared';
import type { AudioScript, AudioUploadFormat, BuiltScript, RenderedFile, ScriptLine } from '@sivoov/shared';
import type { Db } from '../db/queries';
import type { ScriptDb } from '../db/scriptQueries';
import { sha256HexBytes } from './crypto';
import { ceremonyIssueText, takeTitle } from '../pages/org/studioCopy';
import { checkCeremony, sourceKey } from './ceremonyChecks';
import { storeDefs } from './personal';
import { scriptFingerprint } from './studio';
import { uploadKey } from './uploads';
import { mapLimit } from './mapLimit';

/**
 * `fix`: a line has nothing to read or something to correct. `missing`: a line's sound is not there yet.
 * `warnings`: what went out but deserves a look (a countdown that is not ten seconds long), in the organizer's words.
 */
export type PublishOutcome =
  | { ok: true; version: number; files: number; bytes: number; warnings: string[] }
  | { ok: false; reason: 'fix' | 'missing'; missing: { id: string; title: string }[] };

/** The sentence the admin shows when a publish is refused. */
export const refusalText = (outcome: Extract<PublishOutcome, { ok: false }>): string => {
  const names = outcome.missing.map((m) => m.title || m.id).join(', ');
  return outcome.reason === 'fix' ? `Annonces à compléter avant de publier : ${names}.` : `Il manque le son de : ${names}.`;
};

/** One file of the pack and where its sound waits: a line's words or one of its takes (`take`), or its ambiance. */
type Source = { line: ScriptLine; take?: string; key: string; fileKey: string; format: AudioUploadFormat };

/** Every file the pack needs: each voicing of each line (its own words, every take), then the ambiances. */
const sourcesOf = async (built: BuiltScript): Promise<Source[]> => {
  const voice = voiceFormat(built.voice);
  const voiced = await Promise.all(
    built.lines.flatMap((line) =>
      voicingsOf(line, voice).map(async (v) => ({
        line,
        ...(v.take ? { take: v.take } : {}),
        key: await sourceKey(built, line, v),
        fileKey: v.fileKey,
        format: v.audio?.format ?? voice,
      })),
    ),
  );
  const unders = built.lines.flatMap((line) => (line.under ? [{ line, key: uploadKey(line.under), fileKey: underFileKey(line)!, format: line.under.format }] : []));
  return [...voiced, ...unders];
};

/** How long a file plays, for the app's rhythm director; M4A is not read (a false MP3 frame would lie). */
const secondsOf = (body: ArrayBuffer, format: AudioUploadFormat): number | undefined => {
  const seconds = format === 'm4a' ? null : audioSeconds(new Uint8Array(body), body.byteLength);
  return seconds === null ? undefined : Math.round(seconds * 1000) / 1000;
};

/**
 * Publishing turns the draft into the pack the app downloads: every line's sound, and every take's
 * (the rendered voice from the `tts/` cache, by the line's own voice when it has one, or the
 * organizer's own file from `studio-uploads/`; for a personal line, its offline version), is
 * copied to `packs/<courseId>/<version>/<key>.<ext>` with how long it plays, the manifest lands
 * beside them and in `audio_packs`, the personal lines' definitions go to `personal-defs/`
 * (private: the runners' own versions are made from them), and the draft moves on to the next
 * version, remembering what it published. Packs are immutable per version (the audio route
 * caches them for a year), so nothing published is ever touched.
 */
export const publishScript = async (deps: { db: Db; scripts: ScriptDb; files: R2Bucket }, script: AudioScript, now: Date = new Date()): Promise<PublishOutcome> => {
  const built = buildScript(script);
  // A take's problem names the take, as a missing take's sound does.
  const toFix = built.lines.flatMap((l) => [...new Set(lineIssues(l).map((i) => i.take))].map((take) => ({ id: l.id, title: take ? takeTitle(l.title || l.id, take) : l.title })));
  if (toFix.length > 0) return { ok: false, reason: 'fix', missing: toFix };
  // Heads first (no bodies held open), then the copies a few at a time: a Worker may keep only
  // six connections open, and a pack has dozens of files.
  const sources = await sourcesOf(built);
  const heads = await mapLimit(sources, 6, async (src) => ({ ...src, found: (await deps.files.head(src.key)) !== null }));
  const missing = heads.filter((h) => !h.found).map((h) => ({ id: h.line.id, title: h.take ? takeTitle(h.line.title || h.line.id, h.take) : h.line.title }));
  if (missing.length > 0) return { ok: false, reason: 'missing', missing };

  const prefix = packPrefix(script.courseId, script.version);
  const rendered: RenderedFile[] = await mapLimit(sources, 4, async ({ key, fileKey, format }): Promise<RenderedFile> => {
    const object = await deps.files.get(key);
    if (!object) throw new Error(`${key} vanished while publishing`);
    const body = await object.arrayBuffer();
    await deps.files.put(`${prefix}/${fileKey}`, body, { httpMetadata: { contentType: AUDIO_CONTENT_TYPES[format] } });
    const seconds = secondsOf(body, format);
    return { key: fileKey, bytes: body.byteLength, sha256: await sha256HexBytes(body), ...(seconds === undefined ? {} : { seconds }) };
  });

  const pack = manifestFor(built, rendered);
  const defs = personalDefsFor(built);
  if (defs.lines.length > 0) await storeDefs(deps.files, defs);
  await deps.files.put(`${prefix}/manifest.json`, JSON.stringify(pack), { httpMetadata: { contentType: 'application/json' } });
  await deps.db.upsertAudioPack(pack);
  const published = { version: pack.version, at: now.toISOString(), fingerprint: await scriptFingerprint(script) };
  await deps.scripts.saveDraft({ ...script, version: script.version + 1, published });
  const ceremony = await checkCeremony(deps.files, built);
  const warnings = built.lines.flatMap((l) => (ceremony[l.id] ?? []).map((issue) => `${l.title || l.id} : ${ceremonyIssueText(issue)}`));
  return { ok: true, version: pack.version, files: rendered.length, bytes: rendered.reduce((n, r) => n + r.bytes, 0), warnings };
};
