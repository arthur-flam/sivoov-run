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

const { createEventPlayer, playSequence } = await import('./player');

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

describe('sequence playback', () => {
  beforeEach(() => {
    players.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const recorder = () => {
    const log: string[] = [];
    return {
      log,
      handlers: {
        onStart: (i: number, remaining: number, elapsed: number) => log.push(`start ${i} ${remaining} ${elapsed}`),
        onRemaining: (i: number, remaining: number) => log.push(`left ${i} ${remaining}`),
        onDone: () => log.push('done'),
        onFail: (i: number) => log.push(`fail ${i}`),
      },
    };
  };

  it('plays the files back to back, saying when each one starts and how long it has left', () => {
    const { log, handlers } = recorder();
    playSequence(['file://intro', 'file://countdown', 'file://gun'], handlers);
    expect(players.map((p) => p.uri)).toEqual(['file://intro']);
    players[0]!.emit(status({ duration: 20, playing: true }));
    players[0]!.emit(status({ didJustFinish: true }));
    players[1]!.emit(status({ duration: 10, playing: true }));
    players[1]!.emit(status({ duration: 10, currentTime: 3.4, playing: true }));
    players[1]!.emit(status({ didJustFinish: true }));
    players[2]!.emit(status({ duration: 2, currentTime: 0.2, playing: true }));
    players[2]!.emit(status({ didJustFinish: true }));
    expect(players.map((p) => p.uri)).toEqual(['file://intro', 'file://countdown', 'file://gun']);
    expect(log).toEqual(['start 0 20 0', 'start 1 10 0', 'left 1 6.6', 'start 2 1.8 0.2', 'done']);
  });

  it('does not call a file started while it is only loaded', () => {
    const { log, handlers } = recorder();
    playSequence(['file://gun'], handlers);
    players[0]!.emit(status({ duration: 2, playing: false }));
    expect(log).toEqual([]);
    players[0]!.emit(status({ duration: 2, currentTime: 0.1, playing: false }));
    expect(log).toEqual(['start 0 1.9 0.1']);
  });

  it('stops at a file that never loads and says which one, instead of playing half a sentence', () => {
    const { log, handlers } = recorder();
    playSequence(['file://intro', 'https://cdn/offline.mp3', 'file://gun'], handlers);
    players[0]!.emit(status({ duration: 5, playing: true }));
    players[0]!.emit(status({ didJustFinish: true }));
    vi.advanceTimersByTime(8000);
    expect(log).toEqual(['start 0 5 0', 'fail 1']);
    expect(players.map((p) => p.uri)).toEqual(['file://intro', 'https://cdn/offline.mp3']);
  });

  it('stops at a file that reports a failure', () => {
    const { log, handlers } = recorder();
    playSequence(['file://bad', 'file://gun'], handlers);
    players[0]!.emit(status({ playbackState: 'failed', isLoaded: false }));
    expect(log).toEqual(['fail 0']);
    expect(players).toHaveLength(1);
  });

  it('goes silent when stopped: no next file, no callback', () => {
    const { log, handlers } = recorder();
    const sequence = playSequence(['file://intro', 'file://gun'], handlers);
    players[0]!.emit(status({ duration: 5, playing: true }));
    sequence.stop();
    players[0]!.emit(status({ didJustFinish: true }));
    vi.advanceTimersByTime(20_000);
    expect(log).toEqual(['start 0 5 0']);
    expect(players).toHaveLength(1);
  });
});
