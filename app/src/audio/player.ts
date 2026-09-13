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

/**
 * Plays queued events one at a time through expo-audio. A new player per item keeps the
 * state machine trivial; the queue module decides order and interruptions.
 */
export const createEventPlayer = (onChange: (current: QueueItem | null) => void = () => undefined): EventPlayer => {
  let queue: Queue = emptyQueue();
  let player: AudioPlayer | null = null;

  const release = () => {
    player?.removeAllListeners('playbackStatusUpdate');
    player?.remove();
    player = null;
  };

  const startCurrent = () => {
    release();
    const item = queue.current;
    onChange(item);
    if (!item) return;
    const p = createAudioPlayer({ uri: item.uri });
    player = p;
    p.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) next();
    });
    p.play();
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
