import { Platform } from 'react-native';
import { create } from 'zustand';
import { assignPhotos, momentPasses } from '@sivoov/shared';
import type { CourseMoment, Split } from '@sivoov/shared';
import { api } from '@/api';
import type { PhotoView } from '@/api';
import { diag } from '@/diag';
import { takeSelfie } from '@/photos/picker';
import type { PickedPhoto } from '@/photos/picker';
import { photoQueue } from '@/photos/queue';

/** The run the photos are matched against: when it started, how long, and its kilometres. */
export type PhotoRun = { startedAtMs: number; elapsedMs: number; splits: Split[] };

type Busy = 'loading' | 'sending' | 'making' | null;

type PhotosStore = {
  enabled: boolean;
  moments: CourseMoment[];
  photos: PhotoView[];
  busy: Busy;
  error: 'offline' | 'failed' | null;
  load: (token: string) => Promise<void>;
  /**
   * Sends the photos the runner picked. Without `momentId`, each goes to the moment it was taken
   * closest to (its EXIF time against when the runner passed there); with it, the first photo
   * goes to that moment. Returns how many were sent and how many matched no moment.
   */
  send: (token: string, picked: PickedPhoto[], run: PhotoRun | null, officialM: number, momentId?: string) => Promise<{ sent: number; unmatched: number }>;
  /** After the run: every photo sent gets its picture. */
  make: (token: string) => Promise<void>;
  /**
   * The camera, from the run screen or the line: the photo is kept on the phone for `momentId`
   * and sent as soon as it can be. False when the runner closed the camera.
   */
  snap: (token: string, momentId: string) => Promise<boolean>;
  /** Sends what the camera kept; stops at the first failure (no network) and tries again later. */
  flush: (token: string) => Promise<void>;
  /** Moments whose photo was taken in the app and is still on the phone. */
  kept: string[];
};

/** The moments that have their photo: sent, or kept on the phone until it can be. */
export const takenMoments = (s: Pick<PhotosStore, 'kept' | 'photos'>): string[] => [...s.kept, ...s.photos.map((p) => p.momentId)];

/** The photo as a form part: a File on the web target, a file URI on a phone. */
const formFor = (photo: PickedPhoto): FormData => {
  const form = new FormData();
  if (Platform.OS === 'web' && photo.file) form.append('photo', photo.file);
  else form.append('photo', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
  // The runner agreed on the screen that sent it: the button says the photo goes to the image model.
  form.append('consent', 'on');
  return form;
};

const merge = (photos: PhotoView[], changed: PhotoView[]): PhotoView[] => {
  const byId = new Map(changed.map((p) => [p.id, p]));
  const kept = photos.filter((p) => !byId.has(p.id) && !changed.some((c) => c.momentId === p.momentId));
  return [...kept, ...changed];
};

/** One flush at a time: the camera and the screens all ask for one. */
const flushing = { now: false, again: false };

/** The runner's race photos: the moments of their course, what they sent, the pictures made. */
export const usePhotos = create<PhotosStore>((set, get) => ({
  enabled: false,
  moments: [],
  photos: [],
  busy: null,
  error: null,
  kept: [],
  async load(token) {
    set({ busy: get().busy ?? 'loading', error: null });
    try {
      const { enabled, moments, photos } = await api.photos(token);
      set({ enabled, moments, photos });
      void get().flush(token);
    } catch (e) {
      diag('photos', `load failed: ${e instanceof Error ? e.message : String(e)}`);
      set({ error: 'offline' });
    } finally {
      if (get().busy === 'loading') set({ busy: null });
    }
  },
  async send(token, picked, run, officialM, momentId) {
    const { moments } = get();
    const assigned = momentId
      ? new Map(picked[0] ? [[momentId, picked[0].id]] : [])
      : assignPhotos(
          picked.map((p) => ({ id: p.id, takenAtMs: p.takenAtMs })),
          run ? momentPasses(moments, run, officialM) : [],
          moments,
          officialM,
        );
    const byId = new Map(picked.map((p) => [p.id, p]));
    set({ busy: 'sending', error: null });
    try {
      // One at a time: a phone on a race-day network, several MB each.
      const sent = await [...assigned].reduce<Promise<PhotoView[]>>(async (done, [moment, photoId]) => {
        const list = await done;
        const photo = byId.get(photoId);
        return photo ? [...list, (await api.sendPhoto(token, moment, formFor(photo))).photo] : list;
      }, Promise.resolve([]));
      set({ photos: merge(get().photos, sent) });
      diag('photos', `sent ${sent.length} of ${picked.length}`);
      return { sent: sent.length, unmatched: picked.length - assigned.size };
    } catch (e) {
      diag('photos', `send failed: ${e instanceof Error ? e.message : String(e)}`);
      set({ error: 'failed' });
      return { sent: 0, unmatched: picked.length };
    } finally {
      set({ busy: null });
    }
  },
  async snap(token, momentId) {
    const photo = await takeSelfie();
    if (!photo) return false;
    await photoQueue.add(momentId, photo);
    set({ kept: [...new Set([...get().kept, momentId])] });
    void get().flush(token);
    return true;
  },
  async flush(token) {
    // Asked again while sending (a photo taken meanwhile): one more pass once this one ends.
    if (flushing.now) {
      flushing.again = true;
      return;
    }
    flushing.now = true;
    try {
      const queued = await photoQueue.list();
      set({ kept: queued.map((q) => q.momentId) });
      await queued.reduce<Promise<boolean>>(async (going, q) => {
        if (!(await going)) return false;
        try {
          const { photo } = await api.sendPhoto(token, q.momentId, formFor(q.photo));
          await photoQueue.done(q);
          set({ photos: merge(get().photos, [photo]), kept: get().kept.filter((id) => id !== q.momentId) });
          return true;
        } catch (e) {
          diag('photos', `flush stopped: ${e instanceof Error ? e.message : String(e)}`);
          return false;
        }
      }, Promise.resolve(true));
    } finally {
      flushing.now = false;
    }
    if (flushing.again) {
      flushing.again = false;
      await get().flush(token);
    }
  },
  async make(token) {
    if (!get().photos.some((p) => p.status === 'waiting')) return;
    set({ busy: 'making', error: null });
    try {
      set({ photos: (await api.renderPhotos(token)).photos });
    } catch (e) {
      diag('photos', `make failed: ${e instanceof Error ? e.message : String(e)}`);
      set({ error: 'failed' });
    } finally {
      set({ busy: null });
    }
  },
}));
