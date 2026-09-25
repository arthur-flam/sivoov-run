import { Platform } from 'react-native';
import { create } from 'zustand';
import type { AudioPack, Course } from '@sivoov/shared';
import { ApiError, api } from '@/api';
import { packV0 } from './pack';

/**
 * 'ready': every file is on the phone (on the web, the manifest is in: files stream at play time).
 * 'none': the course has no published pack yet, the run shows captions only.
 * 'error': the manifest or a file did not come down; loading again retries.
 */
export type PackStatus = 'idle' | 'loading' | 'ready' | 'none' | 'error';

type PackStore = {
  courseId: string | null;
  pack: AudioPack | null;
  status: PackStatus;
  /** What the published pack weighs, for the pre-flight line. */
  bytes: number;
  /** Pack file key -> playable uri (a local file on device, the remote url on web). */
  uris: Record<string, string>;
  load: (course: Course) => Promise<void>;
  uriFor: (key: string) => string | null;
};

type Downloaded = { uris: Record<string, string>; complete: boolean };

/** Native: files land in the cache dir once per (course, version) so a run never needs the network. */
const downloadAll = async (pack: AudioPack): Promise<Downloaded> => {
  if (Platform.OS === 'web') return { uris: Object.fromEntries(Object.entries(pack.files).map(([key, f]) => [key, f.url])), complete: true };
  const fs = await import('expo-file-system');
  const dir = new fs.Directory(fs.Paths.cache, 'packs', pack.courseId, String(pack.version));
  if (!dir.exists) dir.create({ intermediates: true });
  const entries = await Promise.all(
    Object.entries(pack.files).map(async ([key, f]) => {
      const file = new fs.File(dir, key);
      if (file.exists && file.size === f.bytes) return { key, uri: file.uri, local: true };
      if (file.exists) file.delete();
      const downloaded = await fs.File.downloadFileAsync(f.url, file).catch(() => null);
      return { key, uri: downloaded?.uri ?? f.url, local: downloaded !== null };
    }),
  );
  return { uris: Object.fromEntries(entries.map((e) => [e.key, e.uri])), complete: entries.every((e) => e.local) };
};

const packBytes = (pack: AudioPack): number => Object.values(pack.files).reduce((sum, f) => sum + f.bytes, 0);

export const usePackStore = create<PackStore>((set, get) => ({
  courseId: null,
  pack: null,
  status: 'idle',
  bytes: 0,
  uris: {},

  /**
   * The latest published pack, or the v0 event list (captions only) when there is none or it
   * cannot be fetched. Called from the race home, the pre-flight and the run screen: the first
   * call downloads, the others find it loading or ready. After a failure, or with no pack yet,
   * a call tries again without dropping what an earlier attempt already has: a run in progress
   * keeps its files.
   */
  async load(course) {
    const { courseId, status } = get();
    const same = courseId === course.id;
    if (same && (status === 'loading' || status === 'ready')) return;
    set(same ? { status: 'loading' } : { courseId: course.id, status: 'loading', pack: null, bytes: 0, uris: {} });
    const fetched = await api.pack(course.id).catch((e: unknown): 'none' | 'error' => (e instanceof ApiError && e.status === 404 ? 'none' : 'error'));
    if (get().courseId !== course.id) return;
    if (fetched === 'none' || fetched === 'error') {
      set({ pack: get().pack ?? packV0(course), status: fetched });
      return;
    }
    set({ pack: fetched, bytes: packBytes(fetched) });
    const { uris, complete } = await downloadAll(fetched).catch(() => ({ uris: get().uris, complete: false }));
    if (get().courseId !== course.id) return;
    set({ uris, status: complete ? 'ready' : 'error' });
  },

  uriFor(key) {
    return get().uris[key] ?? get().pack?.files[key]?.url ?? null;
  },
}));
