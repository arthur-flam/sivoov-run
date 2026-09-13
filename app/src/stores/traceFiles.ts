import { Platform } from 'react-native';
import { RunTraceSchema } from '@sivoov/shared';
import type { RunTrace } from '@sivoov/shared';

const WEB_PREFIX = 'sivoov.trace.';
const DIR = 'traces';

const parseTrace = (raw: string | null): RunTrace | null => {
  if (raw === null) return null;
  try {
    const parsed = RunTraceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/** Native: the trace lands in the document dir (SecureStore caps values at ~2 KB, a marathon trace is ~1 MB). */
const nativeFile = async (path: string) => {
  const fs = await import('expo-file-system');
  return new fs.File(path);
};

/**
 * Trace bodies live outside the key/value store: a file under `traces/<runId>.json` on device,
 * a `localStorage` entry on the web target. The returned path is what the upload queue persists.
 */
export const traceFiles = {
  async write(runId: string, trace: RunTrace): Promise<string> {
    const body = JSON.stringify(trace);
    if (Platform.OS === 'web') {
      const key = `${WEB_PREFIX}${runId}`;
      try {
        globalThis.localStorage?.setItem(key, body);
      } catch {
        /* private mode */
      }
      return key;
    }
    const fs = await import('expo-file-system');
    const dir = new fs.Directory(fs.Paths.document, DIR);
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new fs.File(dir, `${runId}.json`);
    file.write(body);
    return file.uri;
  },

  async read(path: string): Promise<RunTrace | null> {
    if (Platform.OS === 'web') {
      try {
        return parseTrace(globalThis.localStorage?.getItem(path) ?? null);
      } catch {
        return null;
      }
    }
    try {
      const file = await nativeFile(path);
      return file.exists ? parseTrace(await file.text()) : null;
    } catch {
      return null;
    }
  },

  async remove(path: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(path);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const file = await nativeFile(path);
      if (file.exists) file.delete();
    } catch {
      /* already gone */
    }
  },
};
