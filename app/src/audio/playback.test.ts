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
/** What the live lines were asked for: the event and the take, the server never answers (offline). */
const liveAsked = vi.hoisted(() => [] as { eventId: string; take?: string }[]);
vi.mock('./live', () => ({
  liveSound: async (_pack: unknown, event: AudioEvent, _state: unknown, _token: unknown, take?: string) => {
    liveAsked.push({ eventId: event.id, ...(take ? { take } : {}) });
    return null;
  },
  resetLiveLines: () => undefined,
}));
// The run journals itself to disk; nothing here needs it.
vi.mock('@/stores/journalFiles', () => ({
  journalFiles: { open: async () => undefined, writeMeta: async () => undefined, append: async () => undefined, readMeta: async () => null, read: async () => null, clear: async () => undefined },
}));
/** Every file of the pack is on the phone: a line's, or the take's the run chose. */
vi.mock('./packStore', async () => {
  const { fileOf } = await import('@sivoov/shared');
  return {
    usePackStore: {
      getState: () => ({
        captions: {},
        uriFor: () => null,
        soundFor: (event: AudioEvent, take?: string) => {
          const key = fileOf(event, take);
          return key ? `file://${key}` : null;
        },
      }),
    },
  };
});

const { idleRun, startRun } = await import('@sivoov/shared');
const { useRun } = await import('@/stores/run');
const { useSaid } = await import('./said');
const { bindPlayback, releasePlayback, screenMounted, screenUnmounted } = await import('./playback');

/** Each line cuts the one before: the fake files never end, a queued line would never start. */
const place = (id: string, meters: number) => ({ id, trigger: { kind: 'distance', meters }, source: { kind: 'file', key: `${id}.mp3` }, mix: 'interrupt', priority: 5, category: 'course' });
/** A pool of cheers between the places, and a split with a take said live. */
const pool = (id: string, takes: Record<string, unknown>[]) => ({ ...place(id, 0), trigger: { kind: 'filler' }, category: 'personal', takes });
const pack = AudioPackSchema.parse({
  courseId: 'c',
  version: 2,
  events: [
    place('planches', 200),
    place('casino', 1500),
    place('port', 3000),
    pool('cheers', [
      { id: 'a', key: 'cheers~a.mp3', caption: 'Allez, on y va !' },
      { id: 'b', key: 'cheers~b.mp3', caption: 'Ça repart !' },
    ]),
    pool('split', [{ id: 'b', key: 'split~b.mp3', caption: 'Et un de plus.', personal: { phase: 'live' } }]),
  ],
  files: {},
});
const fired = (eventId: string, extra: { silent?: boolean; take?: string; key?: string } = {}) => ({ eventId, key: eventId, distanceM: 0, elapsedMs: 0, ...extra });
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

  it('says the take the run chose, from its own file, with its own words', () => {
    bindPlayback();
    fire(fired('cheers', { key: 'cheers#1' }), fired('cheers', { key: 'cheers#2', take: 'b' }));
    expect(played).toEqual(['file://cheers.mp3', 'file://cheers~b.mp3']);
    expect(useSaid.getState().lines.map((l) => [l.key, l.text])).toEqual([
      ['cheers#1', null],
      ['cheers#2', 'Ça repart !'],
    ]);
  });

  it('asks for a take said live by its id, and plays its offline file without a network', async () => {
    liveAsked.length = 0;
    bindPlayback();
    fire(fired('split', { key: 'split#1', take: 'b' }));
    await vi.waitFor(() => expect(played).toEqual(['file://split~b.mp3']));
    expect(liveAsked).toEqual([{ eventId: 'split', take: 'b' }]);
    // The line's own words are not a live line: nothing to ask.
    fire(fired('split', { key: 'split#2' }));
    expect(liveAsked).toHaveLength(1);
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

  it('lets the finish play to its end when the runner leaves the finish screen, and gives way to the next run', () => {
    screenMounted();
    const running = startRun(idleRun(10_000), 0);
    useRun.setState({ state: running });
    fire(fired('port'));
    useRun.setState({ phase: 'finished', state: { ...running, phase: 'finished' } });
    // « Accueil »: the screen goes, then the run is reset.
    screenUnmounted();
    useRun.setState({ phase: 'idle', fired: [], state: idleRun(10_000) });
    expect(released).toEqual([]);
    // Nothing new is said by the run that is over.
    useRun.setState({ phase: 'running', fired: [fired('casino')] });
    expect(played).toEqual(['file://port.mp3']);
    // A new run screen cuts the tail of the last finish.
    screenMounted();
    expect(released).toEqual(['file://port.mp3']);
    screenUnmounted();
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
