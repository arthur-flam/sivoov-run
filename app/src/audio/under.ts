import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

/** How long an ambiance takes to fade out when the next one arrives or the run stops. */
const FADE_MS = 800;
const FADE_STEPS = 8;

export type Ambiance = {
  /** Starts `uri` under the voice, fading out the one before. Returns a ticket for `stop`. */
  start: (uri: string) => number;
  /** Fades the ambiance out: any one, or only the one `ticket` started (a later one is left alone). */
  stop: (ticket?: number) => void;
};

/**
 * The ambiance under the voice (AudioEvent.under): a crowd, the start music. One at a time,
 * on its own player beside the voice, so a runner's own line (their name, their time) sounds
 * inside the crowd instead of in silence. It plays to its own end; the next ambiance or the end
 * of the run fades it out. A file that fails is simply not heard: the voice never waits for it.
 */
export const createAmbiance = (): Ambiance => {
  let current: { player: AudioPlayer; ticket: number } | null = null;
  let tickets = 0;

  const fadeOut = (player: AudioPlayer) => {
    let step = 0;
    const id = setInterval(() => {
      step += 1;
      try {
        player.volume = Math.max(0, 1 - step / FADE_STEPS);
      } catch {
        step = FADE_STEPS;
      }
      if (step < FADE_STEPS) return;
      clearInterval(id);
      try {
        player.remove();
      } catch {
        // Already released.
      }
    }, FADE_MS / FADE_STEPS);
  };

  return {
    start(uri) {
      if (current) fadeOut(current.player);
      current = null;
      tickets += 1;
      try {
        const player = createAudioPlayer({ uri });
        player.play();
        current = { player, ticket: tickets };
      } catch {
        current = null;
      }
      return tickets;
    },
    stop(ticket) {
      if (!current || (ticket !== undefined && ticket !== current.ticket)) return;
      fadeOut(current.player);
      current = null;
    },
  };
};

/** The app's one ambiance: the start ceremony hands it over to the run at the gun. */
export const ambiance: Ambiance = createAmbiance();
