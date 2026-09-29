import { create } from 'zustand';
import { z } from 'zod';
import { VoiceLevelSchema } from '@sivoov/shared';
import type { VoiceLevel } from '@sivoov/shared';
import { storage } from '@/storage';

/**
 * How the runner sees the run: the camera behind them on the course ('follow'), the whole
 * course from above ('overview'), or the numbers alone with the course drawing ('numbers', which
 * also spares the battery a 3D map).
 */
export const MapViewSchema = z.enum(['follow', 'overview', 'numbers']);
export type MapView = z.infer<typeof MapViewSchema>;

const PrefsSchema = z.object({ voice: VoiceLevelSchema.catch('all'), view: MapViewSchema.catch('follow') });
type Prefs = z.infer<typeof PrefsSchema>;

const KEY = 'sivoov.prefs';
const DEFAULTS: Prefs = { voice: 'all', view: 'follow' };

const parse = (raw: string | null): Prefs => {
  try {
    const parsed = PrefsSchema.safeParse(raw ? JSON.parse(raw) : null);
    return parsed.success ? parsed.data : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

type PrefsStore = Prefs & {
  loaded: boolean;
  load: () => Promise<void>;
  setVoice: (voice: VoiceLevel) => void;
  setView: (view: MapView) => void;
};

/** The runner's own choices on the run screen, kept on the phone from one run to the next. */
export const usePrefs = create<PrefsStore>((set, get) => {
  const save = () => void storage.set(KEY, JSON.stringify({ voice: get().voice, view: get().view })).catch(() => undefined);
  return {
    ...DEFAULTS,
    loaded: false,
    async load() {
      if (get().loaded) return;
      set({ ...parse(await storage.get(KEY).catch(() => null)), loaded: true });
    },
    setVoice(voice) {
      set({ voice });
      save();
    },
    setView(view) {
      set({ view });
      save();
    },
  };
});
