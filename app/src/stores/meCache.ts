import { Platform } from 'react-native';
import { MeSchema } from '@/api';
import type { Me } from '@/api';

const WEB_KEY = 'sivoov.me';
const FILE = 'me.json';

const parse = (raw: string | null): Me | null => {
  if (raw === null) return null;
  try {
    const parsed = MeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const file = async () => {
  const fs = await import('expo-file-system');
  return new fs.File(fs.Paths.document, FILE);
};

/**
 * The last `/me` the API answered, so a cold start with no signal can still run: the course,
 * the race and the entrant are all the run screen needs. A file in the app's private document
 * dir on device (SecureStore caps values at ~2 KB), `localStorage` on the web target.
 */
export const meCache = {
  async read(): Promise<Me | null> {
    try {
      if (Platform.OS === 'web') return parse(globalThis.localStorage?.getItem(WEB_KEY) ?? null);
      const f = await file();
      return f.exists ? parse(await f.text()) : null;
    } catch {
      return null;
    }
  },
  async write(me: Me): Promise<void> {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(me));
      (await file()).write(JSON.stringify(me));
    } catch {
      /* a cache: losing it only costs the offline start */
    }
  },
  async clear(): Promise<void> {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(WEB_KEY);
      const f = await file();
      if (f.exists) f.delete();
    } catch {
      /* already gone */
    }
  },
};
