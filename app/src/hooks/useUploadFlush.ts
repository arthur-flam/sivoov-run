import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useUploads } from '@/stores/uploads';

/** Retries pending uploads on mount and each time the app comes back to the foreground. */
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
  return pendingCount;
};
