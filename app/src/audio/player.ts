import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import type { AudioEvent } from '@sivoov/shared';
import { advance, emptyQueue, enqueue } from './queue';
import { ambiance as sharedAmbiance } from './under';
import type { Ambiance } from './under';
import type { Queue, QueueItem } from './queue';

/** Background playback that ducks the runner's music instead of stopping it (AUDIO.md). */
export const configureAudioSession = (): Promise<void> =>
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: true }).catch(() => undefined);

/** A file that has not loaded by then (a remote file offline, a missing file) fails its sequence. */
const LOAD_TIMEOUT_MS = 8000;
/** Slack past the file's own end before the file is given up on. */
const END_SLACK_MS = 3000;
/** Status updates per file: often enough for countdown digits to turn on the second. */
const UPDATE_INTERVAL_MS = 200;

export type SequenceHandlers = {
  /** File `index` started playing: `elapsed` seconds in (the status arrives a little late), `remaining` to go. */
  onStart?: (index: number, remaining: number, elapsed: number) => void;
  /** File `index` is playing, `remaining` seconds from its end. */
  onRemaining?: (index: number, remaining: number) => void;
  /** File `index` played to its end; the next one is about to load. */
  onEnd?: (index: number) => void;
  /** Every file played to its end. */
  onDone?: () => void;
  /** File `index` never loaded, failed, or overran its length: the sequence stops there. */
  onFail?: (index: number) => void;
};

export type Sequence = { stop: () => void };

/**
 * Plays files back to back, one expo-audio player per file: the start ceremony today, number
 * fragments tomorrow ("kilomètre" + "vingt et un"). A sequence is all or nothing: a file that
 * never loads, reports a failure or overruns its own length stops it, because half a sentence
 * is worse than none. expo-audio reports no load error on Android, hence the watchdog.
 */
export const playSequence = (uris: string[], handlers: SequenceHandlers = {}): Sequence => {
  let player: AudioPlayer | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const release = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    player?.removeAllListeners('playbackStatusUpdate');
    player?.remove();
    player = null;
  };

  const fail = (index: number) => {
    release();
    stopped = true;
    handlers.onFail?.(index);
  };

  const arm = (p: AudioPlayer, index: number, ms: number) => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => player === p && fail(index), ms);
  };

  const playAt = (index: number) => {
    release();
    if (stopped) return;
    const uri = uris[index];
    if (uri === undefined) {
      stopped = true;
      handlers.onDone?.();
      return;
    }
    try {
      const p = createAudioPlayer({ uri }, { updateInterval: UPDATE_INTERVAL_MS });
      player = p;
      arm(p, index, LOAD_TIMEOUT_MS);
      let loaded = false;
      let started = false;
      p.addListener('playbackStatusUpdate', (status) => {
        if (player !== p) return;
        if (status.didJustFinish) {
          handlers.onEnd?.(index);
          return playAt(index + 1);
        }
        if (/error|fail/i.test(status.playbackState) || status.error) return fail(index);
        if (!(status.duration > 0)) return;
        const remaining = Math.max(0, status.duration - status.currentTime);
        if (!loaded) {
          loaded = true;
          arm(p, index, remaining * 1000 + END_SLACK_MS);
        }
        if (started) return handlers.onRemaining?.(index, remaining);
        if (!status.playing && status.currentTime <= 0) return;
        started = true;
        handlers.onStart?.(index, remaining, status.currentTime);
      });
      p.play();
    } catch {
      fail(index);
    }
  };

  playAt(0);
  return {
    stop() {
      stopped = true;
      release();
    },
  };
};

export type EventPlayer = {
  /** `under`: the event's ambiance, started with it (AudioEvent.under). */
  play: (event: AudioEvent, uri: string, under?: string) => void;
  stop: () => void;
};

/** Where a file is once it sounds: seconds played, seconds to go. */
export type Heard = { elapsedS: number; remainingS: number };

/**
 * Plays queued events one at a time, each as a sequence of one file; the queue module decides
 * order and interruptions. A file that fails is skipped: one bad file must not silence the
 * rest of the race. An event's ambiance starts when the event does and outlives it. `onHeard`:
 * the current item's file started sounding, and how long it is (the caption scrolls with it).
 */
export const createEventPlayer = (
  onChange: (current: QueueItem | null) => void = () => undefined,
  ambiance: Ambiance = sharedAmbiance,
  onHeard: (item: QueueItem, heard: Heard) => void = () => undefined,
): EventPlayer => {
  let queue: Queue = emptyQueue();
  let playing: Sequence | null = null;

  const startCurrent = () => {
    playing?.stop();
    playing = null;
    const item = queue.current;
    onChange(item);
    if (!item) return;
    if (item.under) ambiance.start(item.under);
    playing = playSequence([item.uri], { onStart: (_, remainingS, elapsedS) => onHeard(item, { elapsedS, remainingS }), onDone: next, onFail: next });
  };

  const next = () => {
    queue = advance(queue);
    startCurrent();
  };

  return {
    play(event, uri, under) {
      const result = enqueue(queue, under ? { event, uri, under } : { event, uri });
      const wasIdle = queue.current === null;
      queue = result.queue;
      if (wasIdle || result.cut) startCurrent();
    },
    stop() {
      queue = emptyQueue();
      playing?.stop();
      playing = null;
      ambiance.stop();
      onChange(null);
    },
  };
};
