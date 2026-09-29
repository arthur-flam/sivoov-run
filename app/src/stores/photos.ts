import { Platform } from 'react-native';
import { create } from 'zustand';
import { assignPhotos, momentPasses } from '@sivoov/shared';
import type { CourseMoment, Split } from '@sivoov/shared';
import { api } from '@/api';
import type { PhotoView } from '@/api';
import { diag } from '@/diag';
import type { PickedPhoto } from '@/photos/picker';

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
};

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

/** The runner's race photos: the moments of their course, what they sent, the pictures made. */
export const usePhotos = create<PhotosStore>((set, get) => ({
  enabled: false,
  moments: [],
  photos: [],
  busy: null,
  error: null,
  async load(token) {
    set({ busy: get().busy ?? 'loading', error: null });
    try {
      const { enabled, moments, photos } = await api.photos(token);
      set({ enabled, moments, photos });
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
