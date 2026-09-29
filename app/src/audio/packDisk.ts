import { Platform } from 'react-native';
import { z } from 'zod';
import { AudioPackSchema } from '@sivoov/shared';
import type { AudioFile } from '@sivoov/shared';
import type * as FileSystem from 'expo-file-system';
import { withDeadline } from './deadline';

/**
 * The pack on the phone. Files and the manifest live in the app's document dir, which the OS
 * never purges (the cache dir it may, on a full phone, the night before the race):
 * `packs/<course>/<version>/<key>`, the runner's own lines in `voices/<course>/<version>/`,
 * and `packs/<course>/pack.json`, what a cold start with no network plays from. Packs
 * downloaded to the cache dir by older builds are not looked for: the next load with a network
 * downloads them again. The web has no file system: files stream from their urls, nothing kept.
 */

/** A file that has not come down by then is given up on; the next load tries again. */
export const DOWNLOAD_TIMEOUT_MS = 30_000;

/** A file to have on the phone: under `key` in the store, saved as `name`. */
export type Wanted = { key: string; file: Pick<AudioFile, 'url' | 'bytes'>; name: string };

export const packDir = (courseId: string, version: number): string[] => ['packs', courseId, String(version)];
export const voicesDir = (courseId: string, version: number): string[] => ['voices', courseId, String(version)];

const native = () => Platform.OS !== 'web';

/** Imported once: the pack and the runner's lines are looked for side by side. */
let fsModule: Promise<typeof FileSystem> | null = null;

const folder = async (dir: string[]) => {
  const fs = await (fsModule ??= import('expo-file-system'));
  const d = new fs.Directory(fs.Paths.document, ...dir);
  if (!d.exists) d.create({ intermediates: true });
  return { fs, d };
};

/** Key -> local uri of the wanted files already on the phone, whole. None on the web. */
export const onDisk = async (dir: string[], wanted: Wanted[]): Promise<Record<string, string>> => {
  if (!native() || wanted.length === 0) return {};
  try {
    const { fs, d } = await folder(dir);
    const found = wanted.map((w) => ({ w, file: new fs.File(d, w.name) })).filter(({ w, file }) => file.exists && file.size === w.file.bytes);
    return Object.fromEntries(found.map(({ w, file }) => [w.key, file.uri]));
  } catch {
    return {};
  }
};

/**
 * Key -> playable uri of every wanted file that is on the phone once this returns: never a
 * remote url on a phone (a remote file offline would make the player wait for nothing). On the
 * web, the urls themselves. Each download has DOWNLOAD_TIMEOUT_MS; a failure only leaves its
 * key out.
 */
export const download = async (dir: string[], wanted: Wanted[]): Promise<Record<string, string>> => {
  if (!native()) return Object.fromEntries(wanted.map((w) => [w.key, w.file.url]));
  if (wanted.length === 0) return {};
  const { fs, d } = await folder(dir);
  const entries = await Promise.all(
    wanted.map(async (w): Promise<[string, string] | null> => {
      const file = new fs.File(d, w.name);
      if (file.exists && file.size === w.file.bytes) return [w.key, file.uri];
      try {
        if (file.exists) file.delete();
        const done = await withDeadline(fs.File.downloadFileAsync(w.file.url, file), DOWNLOAD_TIMEOUT_MS);
        return [w.key, done.uri];
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((e): e is [string, string] => e !== null));
};

/** What a cold start needs to play the race with no network: the manifest and the runner's own lines. */
const SavedPackSchema = z.object({
  pack: AudioPackSchema,
  /** Event id -> the runner's own version of that line, in `voices/<course>/<version>/`. */
  voices: z.record(z.string(), z.object({ name: z.string(), bytes: z.number() })),
  captions: z.record(z.string(), z.string()),
  personalFor: z.object({ version: z.number(), here: z.boolean(), at: z.number() }).nullable(),
});
export type SavedPack = z.infer<typeof SavedPackSchema>;

const savedFile = async (courseId: string) => {
  const { fs, d } = await folder(['packs', courseId]);
  return new fs.File(d, 'pack.json');
};

export const savedPack = {
  async read(courseId: string): Promise<SavedPack | null> {
    if (!native()) return null;
    try {
      const f = await savedFile(courseId);
      if (!f.exists) return null;
      const parsed = SavedPackSchema.safeParse(JSON.parse(await f.text()));
      return parsed.success && parsed.data.pack.courseId === courseId ? parsed.data : null;
    } catch {
      return null;
    }
  },
  async write(saved: SavedPack): Promise<void> {
    if (!native()) return;
    try {
      (await savedFile(saved.pack.courseId)).write(JSON.stringify(saved));
    } catch {
      // Losing it only costs the offline cold start: the files are still there for a network start.
    }
  },
};
