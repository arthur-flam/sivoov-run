import { create } from 'zustand';
import { z } from 'zod';
import { RunSchema, RunTraceSchema } from '@sivoov/shared';
import type { DeviceInfo, LocationSample, RunSource, RunState, RunTrace } from '@sivoov/shared';
import { api } from '@/api';
import { storage } from '@/storage';
import { traceFiles } from '@/stores/traceFiles';
import type { Fired } from '@/stores/run';

export const UPLOADS_KEY = 'sivoov.uploads';

/** What lands in storage: the trace body lives in a file (SecureStore caps values at ~2 KB), only its path is kept here. */
const PersistedUploadSchema = z.object({ run: RunSchema, tracePath: z.string(), queuedAt: z.string(), attempts: z.number().int().nonnegative(), lastError: z.string().optional() });
const PersistedSchema = z.object({ pending: z.array(PersistedUploadSchema), sent: z.array(z.string()) });
/** In memory the trace travels with the run; `tracePath` is set once `enqueue` has written the file. */
type PersistedUpload = z.infer<typeof PersistedUploadSchema>;
export type PendingUpload = Omit<PersistedUpload, 'tracePath'> & { trace: RunTrace; tracePath?: string };
export type UploadStatus = 'sent' | 'pending' | 'unknown';

/** A run id without a native crypto module: time plus entropy is enough for one runner. */
export const newRunId = (now = Date.now()): string => `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Turns the run store's end state into what the API stores, validated by the shared schemas. */
export const toUpload = (input: {
  id: string;
  entrantId: string;
  courseId: string;
  state: RunState;
  samples: LocationSample[];
  fired: Fired[];
  source: RunSource;
  device: DeviceInfo;
  finishedAtMs: number;
}): PendingUpload => {
  const { state } = input;
  const run = RunSchema.parse({
    id: input.id,
    entrantId: input.entrantId,
    courseId: input.courseId,
    status: state.phase === 'finished' ? 'finished' : 'abandoned',
    startedAt: state.startedAt === null ? undefined : new Date(state.startedAt).toISOString(),
    finishedAt: new Date(input.finishedAtMs).toISOString(),
    elapsedMs: Math.round(state.elapsedMs),
    distanceM: state.distanceM,
    splits: state.splits,
    source: input.source,
    device: input.device,
  });
  const trace = RunTraceSchema.parse({ runId: input.id, samples: input.samples, audioFired: input.fired.map(({ eventId, distanceM, elapsedMs }) => ({ eventId, distanceM, elapsedMs: Math.round(elapsedMs) })) });
  return { run, trace, queuedAt: new Date(input.finishedAtMs).toISOString(), attempts: 0 };
};

type UploadsState = {
  hydrated: boolean;
  pending: PendingUpload[];
  /** Run ids confirmed by the API, newest last. Kept short. */
  sent: string[];
  flushing: boolean;
  hydrate: () => Promise<void>;
  /** Queues and tries to send right away when a token is at hand. */
  enqueue: (upload: PendingUpload, token?: string | null) => Promise<void>;
  /** Sends every pending upload, oldest first; a failure leaves the run in the queue. */
  flush: (token: string) => Promise<void>;
  statusOf: (runId: string) => UploadStatus;
};

const toPersisted = ({ trace: _trace, tracePath, ...rest }: PendingUpload): PersistedUpload[] => (tracePath === undefined ? [] : [{ ...rest, tracePath }]);

const persist = (state: Pick<UploadsState, 'pending' | 'sent'>) =>
  storage.set(UPLOADS_KEY, JSON.stringify({ pending: state.pending.flatMap(toPersisted), sent: state.sent.slice(-20) }));

/** Reads the trace of each persisted entry back; an entry whose file is missing or corrupt is dropped. */
const rehydrate = async (persisted: PersistedUpload[]): Promise<PendingUpload[]> => {
  const entries = await Promise.all(persisted.map(async (p) => ({ ...p, trace: await traceFiles.read(p.tracePath) })));
  return entries.flatMap(({ trace, ...rest }) => (trace === null ? [] : [{ ...rest, trace }]));
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const useUploads = create<UploadsState>((set, get) => ({
  hydrated: false,
  pending: [],
  sent: [],
  flushing: false,

  async hydrate() {
    const raw = await storage.get(UPLOADS_KEY).catch(() => null);
    const parsed = raw ? PersistedSchema.safeParse(parseJson(raw)) : null;
    // A corrupt queue is dropped rather than blocking every later run.
    const pending = parsed?.success ? await rehydrate(parsed.data.pending) : [];
    set({ hydrated: true, pending, ...(parsed?.success ? { sent: parsed.data.sent } : {}) });
  },

  async enqueue(upload, token) {
    if (!get().hydrated) await get().hydrate();
    const queued = { ...upload, tracePath: await traceFiles.write(upload.run.id, upload.trace) };
    const pending = [...get().pending.filter((p) => p.run.id !== upload.run.id), queued];
    set({ pending });
    await persist({ pending, sent: get().sent });
    if (token) await get().flush(token);
  },

  async flush(token) {
    if (get().flushing) return;
    if (!get().hydrated) await get().hydrate();
    set({ flushing: true });
    try {
      // Sequential on purpose: one marathon trace at a time over a phone connection.
      await get().pending.reduce(async (previous, upload) => {
        await previous;
        try {
          await api.uploadRun(token, upload.run, upload.trace);
          set({ pending: get().pending.filter((p) => p.run.id !== upload.run.id), sent: [...get().sent, upload.run.id] });
          if (upload.tracePath !== undefined) await traceFiles.remove(upload.tracePath);
        } catch (e) {
          set({ pending: get().pending.map((p) => (p.run.id === upload.run.id ? { ...p, attempts: p.attempts + 1, lastError: message(e) } : p)) });
        }
      }, Promise.resolve());
      await persist(get());
    } finally {
      set({ flushing: false });
    }
  },

  statusOf(runId) {
    if (get().sent.includes(runId)) return 'sent';
    return get().pending.some((p) => p.run.id === runId) ? 'pending' : 'unknown';
  },
}));
