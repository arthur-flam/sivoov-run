import { create } from 'zustand';
import { api, ApiError } from '@/api';
import type { Me } from '@/api';
import { storage } from '@/storage';
import { meCache } from '@/stores/meCache';

const TOKEN_KEY = 'sivoov.session';

/** The race asked for when the list of races cannot be read (and the first one ever). */
export const DEFAULT_RACE_SLUG = 'deauville-2026';

type SessionState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  token: string | null;
  me: Me | null;
  error: string | null;
  restore: () => Promise<void>;
  requestCode: (raceSlug: string, bib: string, email: string) => Promise<{ devCode?: string }>;
  verifyCode: (raceSlug: string, bib: string, email: string, code: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  token: null,
  me: null,
  error: null,

  async restore() {
    const token = await storage.get(TOKEN_KEY);
    if (!token) return set({ status: 'signedOut' });
    try {
      const me = await api.me(token);
      await meCache.write(me);
      set({ status: 'signedIn', token, me, error: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await storage.remove(TOKEN_KEY);
        await meCache.clear();
        return set({ status: 'signedOut', token: null, me: null });
      }
      // Offline: keep the token and run from the last /me seen; the upload queue sends later.
      set({ status: 'signedIn', token, me: await meCache.read(), error: 'offline' });
    }
  },

  async requestCode(raceSlug, bib, email) {
    const res = await api.requestCode(raceSlug, bib, email);
    return { devCode: res.devCode };
  },

  async verifyCode(raceSlug, bib, email, code) {
    const { token } = await api.verifyCode(raceSlug, bib, email, code);
    await storage.set(TOKEN_KEY, token);
    const me = await api.me(token);
    await meCache.write(me);
    set({ status: 'signedIn', token, me, error: null });
  },

  async refresh() {
    const { token } = get();
    if (!token) return;
    const me = await api.me(token);
    await meCache.write(me);
    set({ me, error: null });
  },

  async signOut() {
    const { token } = get();
    if (token) await api.signOut(token).catch(() => undefined);
    await storage.remove(TOKEN_KEY);
    await meCache.clear();
    set({ status: 'signedOut', token: null, me: null });
  },
}));
