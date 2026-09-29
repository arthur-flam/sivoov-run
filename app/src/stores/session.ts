import { create } from 'zustand';
import type { CodeRequest } from '@sivoov/shared';
import { api, ApiError } from '@/api';
import type { Me } from '@/api';
import { storage } from '@/storage';
import { useLanguage } from '@/stores/language';
import { meCache } from '@/stores/meCache';

const TOKEN_KEY = 'sivoov.session';

type SessionState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  token: string | null;
  me: Me | null;
  error: string | null;
  restore: () => Promise<void>;
  requestCode: (who: CodeRequest) => Promise<{ devCode?: string }>;
  verifyCode: (who: CodeRequest, code: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** « Supprimer mes données », then signed out: the server has ended every session anyway. */
  deleteData: () => Promise<void>;
};

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  token: null,
  me: null,
  error: null,

  async restore() {
    await useLanguage.getState().load();
    const token = await storage.get(TOKEN_KEY);
    if (!token) return set({ status: 'signedOut' });
    try {
      const me = await api.me(token);
      await meCache.write(me);
      await useLanguage.getState().sync(me, token);
      set({ status: 'signedIn', token, me, error: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await storage.remove(TOKEN_KEY);
        await meCache.clear();
        return set({ status: 'signedOut', token: null, me: null });
      }
      // Offline: keep the token and run from the last /me seen; the upload queue sends later.
      const me = await meCache.read();
      if (me) await useLanguage.getState().sync(me, null);
      set({ status: 'signedIn', token, me, error: 'offline' });
    }
  },

  async requestCode(who) {
    // The code's email is written in the language of this screen.
    const res = await api.requestCode({ ...who, locale: useLanguage.getState().locale });
    return { devCode: res.devCode };
  },

  async verifyCode(who, code) {
    const { token } = await api.verifyCode(who, code);
    await storage.set(TOKEN_KEY, token);
    const me = await api.me(token);
    await meCache.write(me);
    await useLanguage.getState().sync(me, token);
    set({ status: 'signedIn', token, me, error: null });
  },

  async refresh() {
    const { token } = get();
    if (!token) return;
    const me = await api.me(token);
    await meCache.write(me);
    await useLanguage.getState().sync(me, token);
    set({ me, error: null });
  },

  async signOut() {
    const { token } = get();
    if (token) await api.signOut(token).catch(() => undefined);
    await storage.remove(TOKEN_KEY);
    await meCache.clear();
    useLanguage.getState().signedOut();
    set({ status: 'signedOut', token: null, me: null });
  },

  async deleteData() {
    const { token } = get();
    if (token) await api.deleteMe(token);
    await storage.remove(TOKEN_KEY);
    await meCache.clear();
    useLanguage.getState().signedOut();
    set({ status: 'signedOut', token: null, me: null });
  },
}));
