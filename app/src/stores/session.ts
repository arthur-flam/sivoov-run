import { create } from 'zustand';
import { api, ApiError } from '@/api';
import type { Me } from '@/api';
import { storage } from '@/storage';

const TOKEN_KEY = 'sivoov.session';

/** The first race is the only race: the app is scoped to it until the race picker exists. */
export const RACE_SLUG = 'deauville-2026';

type SessionState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  token: string | null;
  me: Me | null;
  error: string | null;
  restore: () => Promise<void>;
  requestCode: (bib: string, email: string) => Promise<{ devCode?: string }>;
  verifyCode: (bib: string, email: string, code: string) => Promise<void>;
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
      set({ status: 'signedIn', token, me, error: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await storage.remove(TOKEN_KEY);
        return set({ status: 'signedOut', token: null, me: null });
      }
      // Offline: keep the token, the race home renders from the cache later.
      set({ status: 'signedIn', token, me: null, error: 'offline' });
    }
  },

  async requestCode(bib, email) {
    const res = await api.requestCode(RACE_SLUG, bib, email);
    return { devCode: res.devCode };
  },

  async verifyCode(bib, email, code) {
    const { token } = await api.verifyCode(RACE_SLUG, bib, email, code);
    await storage.set(TOKEN_KEY, token);
    const me = await api.me(token);
    set({ status: 'signedIn', token, me, error: null });
  },

  async refresh() {
    const { token } = get();
    if (!token) return;
    set({ me: await api.me(token), error: null });
  },

  async signOut() {
    const { token } = get();
    if (token) await api.signOut(token).catch(() => undefined);
    await storage.remove(TOKEN_KEY);
    set({ status: 'signedOut', token: null, me: null });
  },
}));
