import type { AudioPack, RunState } from '@sivoov/shared';
import { useRun } from '@/stores/run';
import { usePrefs } from '@/stores/prefs';
import { useSession } from '@/stores/session';
import { liveSound, resetLiveLines } from './live';
import { usePackStore } from './packStore';
import { configureAudioSession, createEventPlayer } from './player';
import type { EventPlayer } from './player';
import { captionFor, soundOf, useSaid } from './said';
import type { SaidLine } from './said';

/** A fired record as the run store writes it; `silent`: a backlog already handled before a crash, neither played nor listed. */
type FiredRecord = { eventId: string; key: string; distanceM: number; elapsedMs: number; silent?: boolean };

const silent = (record: FiredRecord): boolean => record.silent === true;

/**
 * Plays one fired record and writes it to the list the screen reads (`useSaid`): its words, and
 * whether it was heard. The runner's voice level (« moins de voix ») skips a line's sound, never
 * its place in the list. The sound is the runner's own version of a personal line when there is
 * one (downloaded before the start, or said live), the pack's file otherwise; events with no
 * file at all are read, not heard.
 */
const playRecord = (player: EventPlayer, pack: AudioPack, state: RunState, record: FiredRecord): void => {
  const event = pack.events.find((e) => e.id === record.eventId);
  if (!event) return;
  const store = usePackStore.getState();
  const offline = store.soundFor(event);
  const under = event.under ? (store.uriFor(event.under) ?? undefined) : undefined;
  const sound = soundOf(usePrefs.getState().voice, event, offline);
  useSaid.getState().add({ key: record.key, event, text: captionFor(event, store.captions), distanceM: record.distanceM, elapsedMs: record.elapsedMs, sound, uri: offline, at: Date.now() });
  if (sound === 'silenced') return;
  if (event.personal?.phase !== 'live') {
    if (offline) player.play(event, offline, under);
    return;
  }
  void liveSound(pack, event, state, useSession.getState().token).then((live) => {
    const uri = live?.url ?? offline;
    if (!uri || useRun.getState().pack !== pack || stoppedByRunner(useRun.getState().state)) return;
    if (live) useSaid.getState().update(record.key, { uri, sound: 'heard', ...(live.caption ? { text: live.caption } : {}) });
    player.play(event, uri, under);
  });
};

/** The runner ended the run before the line: nothing more is said (a finish still is, to its end). */
const stoppedByRunner = (state: RunState): boolean => state.phase === 'abandoned';

type Binding = { player: EventPlayer; unsubscribe: () => void };

/** The one binding of the run store to the speaker: it outlives the run screen while a run is on. */
let binding: Binding | null = null;
/** How many run screens are mounted: with none, the binding goes once the run is over. */
let screens = 0;

/**
 * Plays every event the run store fires, from now on, until released. Idempotent: a run screen
 * mounted again (Android destroys the React tree when the app is swiped away, the JS runtime
 * and the run may live on) finds the binding in place and nothing plays twice. Records marked
 * `silent` (a backlog restored after a crash) are neither played nor listed. A restored list set
 * in one go is played from where the previous list ended, like any new records.
 */
export const bindPlayback = (): void => {
  if (binding) return;
  const player = createEventPlayer(
    (item) => useSaid.getState().setSpeaking(item?.event.id ?? null),
    undefined,
    (item, heard) => useSaid.getState().setHeard(item.event.id, heard),
  );
  void configureAudioSession();
  const unsubscribe = useRun.subscribe((s, prev) => {
    if (s.phase === 'countdown' && prev.phase === 'idle') resetLiveLines();
    const pack = s.pack;
    if (s.fired !== prev.fired && pack) {
      s.fired
        .slice(prev.fired.length)
        .filter((record) => !silent(record))
        .forEach((record) => playRecord(player, pack, s.state, record));
    }
    // Stopped by the runner: the voice and the music under it stop with the run.
    if (s.phase === 'finished' && prev.phase !== 'finished' && stoppedByRunner(s.state)) player.stop();
    if (s.phase === 'idle' && prev.phase !== 'idle') {
      player.stop();
      if (screens === 0) releasePlayback();
    }
  });
  binding = { player, unsubscribe };
};

/** Stops everything and lets the run store go. */
export const releasePlayback = (): void => {
  if (!binding) return;
  binding.unsubscribe();
  binding.player.stop();
  binding = null;
};

/** A run screen mounts: the binding is made, or the one still playing is kept. */
export const screenMounted = (): void => {
  screens += 1;
  bindPlayback();
};

/** A run screen unmounts: the sound stops unless a run is on (the countdown or the race), which keeps its voice. */
export const screenUnmounted = (): void => {
  screens = Math.max(0, screens - 1);
  const { phase } = useRun.getState();
  if (screens === 0 && phase !== 'running' && phase !== 'countdown') releasePlayback();
};

/** Plays a line again, now, over whatever is speaking. Its ambiance does not come back. */
export const replay = (line: SaidLine): void => {
  if (binding && line.uri) binding.player.play({ ...line.event, mix: 'interrupt', priority: 10 }, line.uri);
};
