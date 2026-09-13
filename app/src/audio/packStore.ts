import { Platform } from 'react-native';
import { create } from 'zustand';
import type { AudioPack, Course } from '@sivoov/shared';
import { api } from '@/api';
import { packV0 } from './pack';

type PackStatus = 'idle' | 'loading' | 'ready' | 'error';

type PackStore = {
  courseId: string | null;
  pack: AudioPack | null;
  status: PackStatus;
  /** Pack file key -> playable uri (a local file on device, the remote url on web). */
  uris: Record<string, string>;
  load: (course: Course) => Promise<void>;
  uriFor: (key: string) => string | null;
};

/** Native: files land in the cache dir once per (course, version) so a run never needs the network. */
const downloadAll = async (pack: AudioPack): Promise<Record<string, string>> => {
  if (Platform.OS === 'web') return Object.fromEntries(Object.entries(pack.files).map(([key, f]) => [key, f.url]));
  const fs = await import('expo-file-system');
  const dir = new fs.Directory(fs.Paths.cache, 'packs', pack.courseId, String(pack.version));
  if (!dir.exists) dir.create({ intermediates: true });
  const entries = await Promise.all(
    Object.entries(pack.files).map(async ([key, f]) => {
      const file = new fs.File(dir, key);
      if (file.exists && file.size === f.bytes) return [key, file.uri] as const;
      if (file.exists) file.delete();
      const downloaded = await fs.File.downloadFileAsync(f.url, file).catch(() => null);
      return [key, downloaded?.uri ?? f.url] as const;
    }),
  );
  return Object.fromEntries(entries);
};

export const usePackStore = create<PackStore>((set, get) => ({
  courseId: null,
  pack: null,
  status: 'idle',
  uris: {},

  /** The latest published pack, or the v0 event list (captions only) when none exists yet. */
  async load(course) {
    if (get().courseId === course.id && get().status !== 'error') return;
    set({ courseId: course.id, status: 'loading', pack: null, uris: {} });
    const pack = await api.pack(course.id).catch(() => packV0(course));
    if (get().courseId !== course.id) return;
    set({ pack });
    const uris = await downloadAll(pack).catch(() => ({}));
    if (get().courseId !== course.id) return;
    set({ uris, status: 'ready' });
  },

  uriFor(key) {
    return get().uris[key] ?? get().pack?.files[key]?.url ?? null;
  },
}));
