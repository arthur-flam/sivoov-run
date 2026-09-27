import { Platform } from 'react-native';
import { create } from 'zustand';
import type { AudioEvent, AudioFile, AudioPack, Course } from '@sivoov/shared';
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
  /**
   * The runner's own versions of the pack's personal lines said before the start (their name,
   * what the AI wrote for them): event id -> playable uri. Absent lines play their offline file.
   */
  personal: Record<string, string>;
  /** The pack version and whether a position went with it, so a later call only refetches what can improve. */
  personalFor: { version: number; here: boolean; at: number } | null;
  load: (course: Course) => Promise<void>;
  /** Fetches and downloads the runner's own lines for the loaded pack. Never throws, never blocks a run. */
  loadPersonal: (token: string, here?: { lat: number; lng: number }) => Promise<void>;
  uriFor: (key: string) => string | null;
  /** What to play for an event before the start or when it has no live version: the runner's own, else the pack's file. */
  soundFor: (event: AudioEvent) => string | null;
};

type Downloaded = { uris: Record<string, string>; complete: boolean };

/** Native: files land in the cache dir under `dir` so a run never needs the network; on the web they stream. */
const download = async (dir: string[], files: [string, AudioFile, string][]): Promise<Downloaded> => {
  if (Platform.OS === 'web') return { uris: Object.fromEntries(files.map(([key, f]) => [key, f.url])), complete: true };
  const fs = await import('expo-file-system');
  const folder = new fs.Directory(fs.Paths.cache, ...dir);
  if (!folder.exists) folder.create({ intermediates: true });
  const entries = await Promise.all(
    files.map(async ([key, f, name]) => {
      const file = new fs.File(folder, name);
      if (file.exists && file.size === f.bytes) return { key, uri: file.uri, local: true };
      if (file.exists) file.delete();
      const downloaded = await fs.File.downloadFileAsync(f.url, file).catch(() => null);
      return { key, uri: downloaded?.uri ?? f.url, local: downloaded !== null };
    }),
  );
  return { uris: Object.fromEntries(entries.map((e) => [e.key, e.uri])), complete: entries.every((e) => e.local) };
};

/** Once per (course, version): the pack's own files, named by their key. */
const downloadAll = (pack: AudioPack): Promise<Downloaded> =>
  download(
    ['packs', pack.courseId, String(pack.version)],
    Object.entries(pack.files).map(([key, f]) => [key, f, key]),
  );

const packBytes = (pack: AudioPack): number => Object.values(pack.files).reduce((sum, f) => sum + f.bytes, 0);

/** A runner's lines are rewritten at most every few hours (the weather), unless a position now comes with the call. */
const PERSONAL_FRESH_MS = 3 * 3600 * 1000;

export const usePackStore = create<PackStore>((set, get) => ({
  courseId: null,
  pack: null,
  status: 'idle',
  bytes: 0,
  uris: {},
  personal: {},
  personalFor: null,

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
    set(same ? { status: 'loading' } : { courseId: course.id, status: 'loading', pack: null, bytes: 0, uris: {}, personal: {}, personalFor: null });
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

  async loadPersonal(token, here) {
    const { pack, personalFor } = get();
    if (!pack || !pack.events.some((e) => e.personal?.phase === 'prepare')) return;
    const fresh = personalFor && personalFor.version === pack.version && Date.now() - personalFor.at < PERSONAL_FRESH_MS;
    if (fresh && (personalFor.here || !here)) return;
    const voices = await api.myVoices(token, here).catch(() => null);
    if (!voices || voices.version !== pack.version || get().pack?.version !== pack.version) return;
    const { uris } = await download(
      ['voices', pack.courseId, String(pack.version)],
      Object.entries(voices.files).map(([eventId, f]) => [eventId, f, `${f.sha256.slice(0, 32)}.${f.url.endsWith('.wav') ? 'wav' : 'mp3'}`]),
    ).catch(() => ({ uris: {} as Record<string, string> }));
    if (get().pack?.version !== pack.version) return;
    set({ personal: { ...get().personal, ...uris }, personalFor: { version: pack.version, here: Boolean(here), at: Date.now() } });
  },

  uriFor(key) {
    return get().uris[key] ?? get().pack?.files[key]?.url ?? null;
  },

  soundFor(event) {
    const own = event.personal?.phase === 'prepare' ? get().personal[event.id] : undefined;
    return own ?? (event.source.kind === 'file' ? get().uriFor(event.source.key) : null);
  },
}));
