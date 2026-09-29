import { Platform } from 'react-native';
import { journalLine, parseJournalSamples, RunJournalSchema } from '@sivoov/shared';
import type { LocationSample, RunJournal } from '@sivoov/shared';

const WEB_META = 'sivoov.run.journal';
const WEB_SAMPLES = 'sivoov.run.samples';
const DIR = 'run';

const parseMeta = (raw: string | null): RunJournal | null => {
  if (raw === null) return null;
  try {
    const parsed = RunJournalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const files = async () => {
  const fs = await import('expo-file-system');
  const dir = new fs.Directory(fs.Paths.document, DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return { meta: new fs.File(dir, 'journal.json'), samples: new fs.File(dir, 'samples.jsonl') };
};

const web = {
  get: (key: string): string | null => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set: (key: string, value: string): void => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* private mode, or full: the run goes on without its journal */
    }
  },
  remove: (key: string): void => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/**
 * The one run in progress, on disk: `run/journal.json` (small, rewritten) and `run/samples.jsonl`
 * (one fix per line, only ever appended) in the document dir, which the OS never purges; two
 * `localStorage` entries on the web target. Every call can throw: callers decide what a failed
 * write costs (never the run itself).
 */
export const journalFiles = {
  async open(journal: RunJournal): Promise<void> {
    if (Platform.OS === 'web') {
      web.set(WEB_META, JSON.stringify(journal));
      web.set(WEB_SAMPLES, '');
      return;
    }
    const f = await files();
    f.samples.write('');
    f.meta.write(JSON.stringify(journal));
  },

  async writeMeta(journal: RunJournal): Promise<void> {
    if (Platform.OS === 'web') return web.set(WEB_META, JSON.stringify(journal));
    (await files()).meta.write(JSON.stringify(journal));
  },

  async append(samples: readonly LocationSample[]): Promise<void> {
    if (samples.length === 0) return;
    const lines = samples.map(journalLine).join('');
    if (Platform.OS === 'web') return web.set(WEB_SAMPLES, `${web.get(WEB_SAMPLES) ?? ''}${lines}`);
    (await files()).samples.write(lines, { append: true });
  },

  async readMeta(): Promise<RunJournal | null> {
    if (Platform.OS === 'web') return parseMeta(web.get(WEB_META));
    const f = await files();
    return f.meta.exists ? parseMeta(await f.meta.text()) : null;
  },

  async read(): Promise<{ journal: RunJournal; samples: LocationSample[] } | null> {
    const journal = await journalFiles.readMeta();
    if (!journal) return null;
    if (Platform.OS === 'web') return { journal, samples: parseJournalSamples(web.get(WEB_SAMPLES) ?? '') };
    const f = await files();
    return { journal, samples: f.samples.exists ? parseJournalSamples(await f.samples.text()) : [] };
  },

  async clear(): Promise<void> {
    if (Platform.OS === 'web') {
      web.remove(WEB_META);
      web.remove(WEB_SAMPLES);
      return;
    }
    const f = await files();
    if (f.meta.exists) f.meta.delete();
    if (f.samples.exists) f.samples.delete();
  },
};
