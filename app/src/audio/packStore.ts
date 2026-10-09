import { create } from 'zustand';
import { fileOf, personalKey } from '@sivoov/shared';
import type { AudioEvent, AudioPack, Course } from '@sivoov/shared';
import { ApiError, api } from '@/api';
import { packV0, takeOf } from './pack';
import { download, onDisk, packDir, savedPack, voicesDir } from './packDisk';
import type { SavedPack, Wanted } from './packDisk';

/**
 * 'ready': every file is on the phone (on the web, the manifest is in: files stream at play time).
 * 'none': the course has no published pack yet, the run shows captions only.
 * 'error': the manifest or a file did not come down; loading again retries.
 * 'loading': nothing usable yet, a load is under way (it ends: every download has a deadline).
 */
export type PackStatus = 'idle' | 'loading' | 'ready' | 'none' | 'error';

type PackStore = {
  courseId: string | null;
  pack: AudioPack | null;
  status: PackStatus;
  /** A newer pack is published but not all on the phone: the one kept plays meanwhile, the next load tries again. */
  outdated: boolean;
  /** What the published pack weighs, for the pre-flight line. */
  bytes: number;
  /** Pack file key -> playable uri: a local file on device (only files that are there), the remote url on web. */
  uris: Record<string, string>;
  /**
   * The runner's own versions of the pack's personal lines said before the start (their name,
   * what the AI wrote for them), and of their takes: `personalKey` (`event` or `event/take`) ->
   * playable uri. Absent lines play their offline file.
   */
  personal: Record<string, string>;
  /** The same lines as saved on the phone (`personalKey` -> file name and size), kept with the manifest. */
  voices: SavedPack['voices'];
  /** What each of the runner's own lines says (`personalKey` -> words), for the run screen's captions. */
  captions: Record<string, string>;
  /** The pack version and whether a position went with it, so a later call only refetches what can improve. */
  personalFor: { version: number; here: boolean; at: number } | null;
  load: (course: Course) => Promise<void>;
  /**
   * The pre-flight's call: like `load`, and when a pack is already on the phone, asks whether a
   * newer one was published since (the organizer may have changed a line) and swaps to it once
   * all its files are down. Never from the run screen: a run keeps the pack it started with.
   */
  update: (course: Course) => Promise<void>;
  /** Fetches and downloads the runner's own lines for the loaded pack. Never throws, never blocks a run. */
  loadPersonal: (token: string, here?: { lat: number; lng: number }) => Promise<void>;
  uriFor: (key: string) => string | null;
  /**
   * What to play for an event, or for one of its takes (`take`), before the start or when it has
   * no live version: the runner's own, else the pack's file.
   */
  soundFor: (event: AudioEvent, take?: string) => string | null;
};

const packFiles = (pack: AudioPack): Wanted[] => Object.entries(pack.files).map(([key, file]) => ({ key, file, name: key }));

const packBytes = (pack: AudioPack): number => Object.values(pack.files).reduce((sum, f) => sum + f.bytes, 0);

/** A pack the Worker published (the v0 event list the app makes up has no file). */
const published = (pack: AudioPack | null): pack is AudioPack => pack !== null && Object.keys(pack.files).length > 0;

const complete = (pack: AudioPack, uris: Record<string, string>): boolean => Object.keys(pack.files).every((key) => key in uris);

/** A runner's lines are rewritten at most every few hours (the weather), unless a position now comes with the call. */
const PERSONAL_FRESH_MS = 3 * 3600 * 1000;

const blank = { pack: null, status: 'loading' as const, outdated: false, bytes: 0, uris: {}, personal: {}, voices: {}, captions: {}, personalFor: null };

/** The load under way, so every screen asking for the same course waits on the same one. */
let inflight: { courseId: string; done: Promise<void> } | null = null;

export const usePackStore = create<PackStore>((set, get) => {
  /** What the phone keeps for a cold start with no network: the published manifest and the runner's own lines. */
  const save = async () => {
    const { pack, voices, captions, personalFor } = get();
    if (published(pack)) await savedPack.write({ pack, voices, captions, personalFor });
  };

  /** The copy kept on the phone, with the files that are still there. */
  const restore = async (courseId: string) => {
    const saved = await savedPack.read(courseId);

    if (!saved) return null;
    const { pack } = saved;
    const voiceFiles = Object.entries(saved.voices).map(([key, v]) => ({ key, file: { url: '', bytes: v.bytes }, name: v.name }));
    const [uris, personal] = await Promise.all([onDisk(packDir(courseId, pack.version), packFiles(pack)), onDisk(voicesDir(courseId, pack.version), voiceFiles)]);

    const voices = Object.fromEntries(Object.entries(saved.voices).filter(([id]) => id in personal));
    const captions = Object.fromEntries(Object.entries(saved.captions).filter(([id]) => id in personal));
    return { pack, uris, personal, voices, captions, personalFor: saved.personalFor, bytes: packBytes(pack), status: complete(pack, uris) ? ('ready' as const) : ('loading' as const) };
  };

  /** Each load's turn: a load overtaken by a later one (another course, a reset store) changes nothing. */
  let generation = 0;

  const refresh = async (course: Course, current: () => boolean) => {
    const fetched = await api.pack(course.id).catch((e: unknown): 'none' | 'error' => (e instanceof ApiError && e.status === 404 ? 'none' : 'error'));
    if (!current()) return;
    const kept = get().pack;
    if (fetched === 'none' || fetched === 'error') {
      if (published(kept)) set({ status: complete(kept, get().uris) ? 'ready' : 'error' });
      else set({ pack: kept ?? packV0(course), status: fetched });
      return;
    }
    const keptWhole = published(kept) && complete(kept, get().uris);
    if (keptWhole && kept.version === fetched.version) {
      set({ status: 'ready', outdated: false });
      return;
    }
    const uris = await download(packDir(course.id, fetched.version), packFiles(fetched)).catch(() => ({}) as Record<string, string>);
    if (!current()) return;
    const whole = complete(fetched, uris);
    // A whole pack on the phone is only given up for another whole one: a race is never half-said.
    if (keptWhole && !whole) {
      set({ status: 'ready', outdated: true });
      return;
    }
    const sameVersion = kept?.version === fetched.version;
    const lines = sameVersion ? {} : { personal: {}, voices: {}, captions: {}, personalFor: null };
    set({ ...lines, pack: fetched, bytes: packBytes(fetched), uris: sameVersion ? { ...get().uris, ...uris } : uris, status: whole ? 'ready' : 'error', outdated: false });
    await save();
  };

  return {
    courseId: null,
    pack: null,
    status: 'idle',
    outdated: false,
    bytes: 0,
    uris: {},
    personal: {},
    voices: {},
    captions: {},
    personalFor: null,

    /**
     * The pack kept on the phone at once (a cold start with no network plays the race from it),
     * then the latest published one from the network: it replaces the kept one when all its
     * files are on the phone. With neither, the v0 event list (captions only). Called from the
     * race home, the pre-flight and the run screen: the first call loads, the others wait on it
     * or find it done. After a failure, or with no pack yet, a call tries again without dropping
     * what an earlier attempt already has: a run in progress keeps its files.
     */
    load(course) {
      const { courseId, status, outdated } = get();
      const same = courseId === course.id;
      if (same && inflight?.courseId === course.id) return inflight.done;
      if (same && status === 'ready' && !outdated) return Promise.resolve();
      const mine = ++generation;
      const current = () => generation === mine;
      const run = async () => {
        if (!same) {
          set({ ...blank, courseId: course.id });
          const kept = await restore(course.id);
          if (!current()) return;
          if (kept) set(kept);
        } else if (status !== 'ready') set({ status: 'loading' });
        await refresh(course, current);
      };
      const done = run().finally(() => {
        if (inflight?.done === done) inflight = null;
      });
      inflight = { courseId: course.id, done };
      return done;
    },

    update(course) {
      const { courseId, status } = get();
      if (courseId !== course.id || status !== 'ready' || inflight?.courseId === course.id) return get().load(course);
      const mine = ++generation;
      const current = () => generation === mine;
      // The pack on the phone stays 'ready' while the newer one comes down: the start is never held up.
      const done = refresh(course, current).finally(() => {
        if (inflight?.done === done) inflight = null;
      });
      inflight = { courseId: course.id, done };
      return done;
    },

    async loadPersonal(token, here) {
      const { pack, personalFor } = get();
      if (!pack || !pack.events.some((e) => e.personal?.phase === 'prepare' || e.takes?.some((t) => t.personal?.phase === 'prepare'))) return;
      const fresh = personalFor && personalFor.version === pack.version && Date.now() - personalFor.at < PERSONAL_FRESH_MS;
      if (fresh && (personalFor.here || !here)) return;
      const answer = await api.myVoices(token, here).catch(() => null);
      if (!answer || answer.version !== pack.version || get().pack?.version !== pack.version) return;
      // Saved by what the file is, never by its key: `event/take` is not a file name.
      const wanted = Object.entries(answer.files).map(([key, f]) => ({ key, file: f, name: `${f.sha256.slice(0, 32)}.${f.url.endsWith('.wav') ? 'wav' : 'mp3'}` }));
      const uris = await download(voicesDir(pack.courseId, pack.version), wanted).catch(() => ({}) as Record<string, string>);
      if (get().pack?.version !== pack.version) return;
      const got = wanted.filter((w) => w.key in uris);
      const captions = Object.fromEntries(Object.entries(answer.captions).filter(([key]) => key in uris));
      set({
        personal: { ...get().personal, ...uris },
        voices: { ...get().voices, ...Object.fromEntries(got.map((w) => [w.key, { name: w.name, bytes: w.file.bytes }])) },
        captions: { ...get().captions, ...captions },
        personalFor: { version: pack.version, here: Boolean(here), at: Date.now() },
      });
      await save();
    },

    uriFor(key) {
      return get().uris[key] ?? null;
    },

    soundFor(event, take) {
      const own = takeOf(event, take)?.personal?.phase === 'prepare' ? get().personal[personalKey(event.id, take)] : undefined;
      const file = fileOf(event, take);
      return own ?? (file ? get().uriFor(file) : null);
    },
  };
});
