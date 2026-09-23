import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import type { AudioEvent } from '@sivoov/shared';
import { advance, emptyQueue, enqueue } from './queue';
import type { Queue, QueueItem } from './queue';

/** Background playback that ducks the runner's music instead of stopping it (AUDIO.md). */
export const configureAudioSession = (): Promise<void> =>
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: true }).catch(() => undefined);

export type EventPlayer = {
  play: (event: AudioEvent, uri: string) => void;
  stop: () => void;
};

/** An item that has not loaded by then (a remote file offline, a missing file) is skipped. */
const LOAD_TIMEOUT_MS = 8000;
/** Slack past the file's own end before the item is given up on. */
const END_SLACK_MS = 3000;

/**
 * Plays queued events one at a time through expo-audio. A new player per item keeps the
 * state machine trivial; the queue module decides order and interruptions.
 * expo-audio reports no load error, so a watchdog moves on from an item that never loads or
 * never finishes: one bad file must not silence the rest of the race.
 */
export const createEventPlayer = (onChange: (current: QueueItem | null) => void = () => undefined): EventPlayer => {
  let queue: Queue = emptyQueue();
  let player: AudioPlayer | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  const arm = (p: AudioPlayer, ms: number) => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => player === p && next(), ms);
  };

  const release = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    player?.removeAllListeners('playbackStatusUpdate');
    player?.remove();
    player = null;
  };

  const startCurrent = () => {
    release();
    const item = queue.current;
    onChange(item);
    if (!item) return;
    try {
      const p = createAudioPlayer({ uri: item.uri });
      player = p;
      arm(p, LOAD_TIMEOUT_MS);
      let loaded = false;
      p.addListener('playbackStatusUpdate', (status) => {
        if (player !== p) return;
        if (status.didJustFinish || /error|fail/i.test(status.playbackState)) return next();
        if (!loaded && status.isLoaded && status.duration > 0) {
          loaded = true;
          arm(p, (status.duration - status.currentTime) * 1000 + END_SLACK_MS);
        }
      });
      p.play();
    } catch {
      next();
    }
  };

  const next = () => {
    queue = advance(queue);
    startCurrent();
  };

  return {
    play(event, uri) {
      const result = enqueue(queue, { event, uri });
      const wasIdle = queue.current === null;
      queue = result.queue;
      if (wasIdle || result.cut) startCurrent();
    },
    stop() {
      queue = emptyQueue();
      release();
      onChange(null);
    },
  };
};
