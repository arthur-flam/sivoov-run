import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPackSchema } from '@sivoov/shared';
import type { AudioEvent } from '@sivoov/shared';

/** expo-audio at the boundary: one fake player per file played. */
const played: string[] = [];
/** The files whose player was let go: a line cut off, or silenced. */
const released: string[] = [];
vi.mock('expo-audio', () => ({
  setAudioModeAsync: async () => undefined,
  createAudioPlayer: ({ uri }: { uri: string }) => {
    played.push(uri);
    return { play: () => undefined, remove: () => released.push(uri), addListener: () => undefined, removeAllListeners: () => undefined };
  },
}));
vi.mock('@/stores/session', () => ({ useSession: { getState: () => ({ token: null }) } }));
vi.mock('@/stores/prefs', () => ({ usePrefs: { getState: () => ({ voice: 'all' }) } }));
vi.mock('./live', () => ({ liveSound: async () => null, resetLiveLines: () => undefined }));
// The run journals itself to disk; nothing here needs it.
vi.mock('@/stores/journalFiles', () => ({
  journalFiles: { open: async () => undefined, writeMeta: async () => undefined, append: async () => undefined, readMeta: async () => null, read: async () => null, clear: async () => undefined },
}));
vi.mock('./packStore', () => ({
  usePackStore: {
    getState: () => ({
      captions: {},
      uriFor: () => null,
      soundFor: (event: AudioEvent) => (event.source.kind === 'file' ? `file://${event.source.key}` : null),
    }),
  },
}));

const { idleRun, startRun } = await import('@sivoov/shared');
const { useRun } = await import('@/stores/run');
const { useSaid } = await import('./said');
const { bindPlayback, releasePlayback, screenMounted, screenUnmounted } = await import('./playback');

/** Each line cuts the one before: the fake files never end, a queued line would never start. */
const place = (id: string, meters: number) => ({ id, trigger: { kind: 'distance', meters }, source: { kind: 'file', key: `${id}.mp3` }, mix: 'interrupt', priority: 5, category: 'course' });
const pack = AudioPackSchema.parse({ courseId: 'c', version: 2, events: [place('planches', 200), place('casino', 1500), place('port', 3000)], files: {} });
const fired = (eventId: string, extra: { silent?: boolean } = {}) => ({ eventId, key: eventId, distanceM: 0, elapsedMs: 0, ...extra });
const fire = (...records: ReturnType<typeof fired>[]) => useRun.setState({ fired: [...useRun.getState().fired, ...records] });
const listed = () => useSaid.getState().lines.map((l) => l.key);

describe('the run’s voice', () => {
  beforeEach(() => {
    played.length = 0;
    released.length = 0;
    useSaid.getState().reset();
    useRun.setState({ pack, fired: [], phase: 'running' });
  });
  afterEach(() => {
    releasePlayback();
    useRun.setState({ phase: 'idle', fired: [] });
  });

  it('says each line once, however many times it is bound', () => {
    bindPlayback();
    bindPlayback();
    fire(fired('planches'));
    expect(played).toEqual(['file://planches.mp3']);
    expect(listed()).toEqual(['planches']);
  });

  it('neither says nor lists the backlog marked silent after a crash, and says what comes next', () => {
    bindPlayback();
    // A resumed run: its list set in one go, what was already handled marked silent.
    useRun.setState({ fired: [fired('planches', { silent: true }), fired('casino', { silent: true }), fired('port')] });
    expect(played).toEqual(['file://port.mp3']);
    expect(listed()).toEqual(['port']);
  });

  it('keeps speaking when the run screen goes during a run, and a screen back does not say anything twice', () => {
    screenMounted();
    fire(fired('planches'));
    screenUnmounted();
    fire(fired('casino'));
    screenMounted();
    fire(fired('port'));
    expect(played).toEqual(['file://planches.mp3', 'file://casino.mp3', 'file://port.mp3']);
    screenUnmounted();
  });

  it('falls silent when the screen goes with no run on', () => {
    useRun.setState({ phase: 'finished' });
    screenMounted();
    screenUnmounted();
    fire(fired('planches'));
    expect(played).toEqual([]);
  });

  it('lets go once the run is over with no screen to hear it', () => {
    screenMounted();
    screenUnmounted();
    useRun.setState({ phase: 'idle', fired: [] });
    useRun.setState({ phase: 'running' });
    fire(fired('planches'));
    expect(played).toEqual([]);
  });

  it('falls silent at once when the runner stops the run', () => {
    bindPlayback();
    const running = startRun(idleRun(10_000), 0);
    useRun.setState({ state: running });
    fire(fired('planches'));
    useRun.setState({ phase: 'finished', state: { ...running, phase: 'abandoned' } });
    expect(released).toEqual(['file://planches.mp3']);
  });

  it('lets the finish line play to its end', () => {
    bindPlayback();
    const running = startRun(idleRun(10_000), 0);
    useRun.setState({ state: running });
    fire(fired('planches'));
    useRun.setState({ phase: 'finished', state: { ...running, phase: 'finished' } });
    expect(released).toEqual([]);
  });
});
