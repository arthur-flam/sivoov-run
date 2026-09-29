import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useUploads } from '@/stores/uploads';

/**
 * While a run waits to be sent and the app is on screen, it is tried again this often: a runner
 * who finished out of signal and stays on the finish screen sees it go when the signal comes back,
 * without leaving the app and coming back.
 */
export const RETRY_EVERY_MS = 30_000;

/** Retries pending uploads on mount, each time the app comes back to the foreground, and every half minute on screen. */
export const useUploadFlush = (token: string | null) => {
  const pendingCount = useUploads((s) => s.pending.length);
  const hydrated = useUploads((s) => s.hydrated);
  useEffect(() => {
    if (!hydrated) void useUploads.getState().hydrate();
  }, [hydrated]);
  useEffect(() => {
    if (!token || !hydrated) return;
    const flush = () => void useUploads.getState().flush(token).catch(() => undefined);
    flush();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && flush());
    return () => sub.remove();
  }, [token, hydrated]);
  useEffect(() => {
    if (!token || !hydrated || pendingCount === 0) return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active') void useUploads.getState().flush(token).catch(() => undefined);
    }, RETRY_EVERY_MS);
    return () => clearInterval(id);
  }, [token, hydrated, pendingCount]);
  return pendingCount;
};
