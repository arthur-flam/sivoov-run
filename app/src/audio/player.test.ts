import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEventSchema } from '@sivoov/shared';

type Listener = (status: Record<string, unknown>) => void;
type FakePlayer = { uri: string; emit: Listener; play: () => void; remove: () => void; addListener: (e: string, l: Listener) => void; removeAllListeners: () => void };
const players: FakePlayer[] = [];
vi.mock('expo-audio', () => ({
  setAudioModeAsync: async () => undefined,
  createAudioPlayer: ({ uri }: { uri: string }) => {
    const p: FakePlayer = {
      uri,
      emit: () => undefined,
      play: () => undefined,
      remove: () => undefined,
      addListener: (_e, l) => {
        p.emit = l;
      },
      removeAllListeners: () => undefined,
    };
    players.push(p);
    return p;
  },
}));

const { createEventPlayer } = await import('./player');

const ev = (id: string) => AudioEventSchema.parse({ id, trigger: { kind: 'start' }, source: { kind: 'file', key: `${id}.mp3` }, mix: 'duck', priority: 5, category: 'course' });
const status = (s: Record<string, unknown>) => ({ didJustFinish: false, playbackState: 'ready', isLoaded: true, duration: 0, currentTime: 0, ...s });

describe('event player', () => {
  beforeEach(() => {
    players.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('plays the next item when the current one finishes', () => {
    const player = createEventPlayer();
    player.play(ev('a'), 'file://a');
    player.play(ev('b'), 'file://b');
    players[0]!.emit(status({ didJustFinish: true }));
    expect(players.map((p) => p.uri)).toEqual(['file://a', 'file://b']);
  });

  it('skips a file that never loads instead of silencing the rest of the race', () => {
    const player = createEventPlayer();
    player.play(ev('offline'), 'https://cdn/offline.mp3');
    player.play(ev('split'), 'file://split');
    vi.advanceTimersByTime(8000);
    expect(players.map((p) => p.uri)).toEqual(['https://cdn/offline.mp3', 'file://split']);
  });

  it('lets a loaded file play to its end before moving on', () => {
    const player = createEventPlayer();
    player.play(ev('long'), 'file://long');
    player.play(ev('next'), 'file://next');
    players[0]!.emit(status({ duration: 30 }));
    vi.advanceTimersByTime(20_000);
    expect(players).toHaveLength(1);
    vi.advanceTimersByTime(15_000);
    expect(players).toHaveLength(2);
  });

  it('moves on when playback reports a failure', () => {
    const player = createEventPlayer();
    player.play(ev('bad'), 'file://bad');
    player.play(ev('good'), 'file://good');
    players[0]!.emit(status({ playbackState: 'failed', isLoaded: false }));
    expect(players.map((p) => p.uri)).toEqual(['file://bad', 'file://good']);
  });
});
