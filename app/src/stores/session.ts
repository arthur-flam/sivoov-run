import { create } from 'zustand';
import type { CodeRequest } from '@sivoov/shared';
import { api, ApiError } from '@/api';
import type { Me } from '@/api';
import { storage } from '@/storage';
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

  /**
   * Signed in from the last /me kept on the phone at once, when there is one: a weak signal
   * must not hold the splash for the network's 20 s. Then /me is asked for: its answer
   * replaces the kept one, a refused token signs out, no answer keeps the kept one ('offline';
   * the upload queue sends later). With nothing kept, the splash waits for /me.
   */
  async restore() {
    const token = await storage.get(TOKEN_KEY);
    if (!token) return set({ status: 'signedOut' });
    const kept = await meCache.read();
    if (kept) set({ status: 'signedIn', token, me: kept, error: null });
    // Signed out or in again while /me was on its way: its answer is about another session.
    const stale = () => get().status !== 'loading' && get().token !== token;
    try {
      const me = await api.me(token);
      if (stale()) return;
      await meCache.write(me);
      set({ status: 'signedIn', token, me, error: null });
    } catch (e) {
      if (stale()) return;
      if (e instanceof ApiError && e.status === 401) {
        await storage.remove(TOKEN_KEY);
        await meCache.clear();
        return set({ status: 'signedOut', token: null, me: null });
      }
      set({ status: 'signedIn', token, me: get().me ?? (await meCache.read()), error: 'offline' });
    }
  },

  async requestCode(who) {
    const res = await api.requestCode(who);
    return { devCode: res.devCode };
  },

  async verifyCode(who, code) {
    const { token } = await api.verifyCode(who, code);
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

  async deleteData() {
    const { token } = get();
    if (token) await api.deleteMe(token);
    await storage.remove(TOKEN_KEY);
    await meCache.clear();
    set({ status: 'signedOut', token: null, me: null });
  },
}));
