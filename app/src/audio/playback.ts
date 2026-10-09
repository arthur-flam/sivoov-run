import type { AudioPack, RunState } from '@sivoov/shared';
import { useRun } from '@/stores/run';
import { usePrefs } from '@/stores/prefs';
import { useSession } from '@/stores/session';
import { liveSound, resetLiveLines } from './live';
import { takeOf } from './pack';
import { usePackStore } from './packStore';
import { configureAudioSession, createEventPlayer } from './player';
import type { EventPlayer } from './player';
import { captionFor, soundOf, useSaid } from './said';
import type { SaidLine } from './said';

/**
 * A fired record as the run store writes it; `take`: which of the line's takes it says;
 * `silent`: a backlog already handled before a crash, neither played nor listed.
 */
type FiredRecord = { eventId: string; key: string; take?: string; distanceM: number; elapsedMs: number; silent?: boolean };

const silent = (record: FiredRecord): boolean => record.silent === true;

/**
 * Plays one fired record and writes it to the list the screen reads (`useSaid`): its words, and
 * whether it was heard. The runner's voice level (« moins de voix ») skips a line's sound, never
 * its place in the list. The sound is the take the engine chose, or the line's own words: the
 * runner's own version of it when there is one (downloaded before the start, or said live), the
 * pack's file otherwise; events with no file at all are read, not heard.
 */
const playRecord = (player: EventPlayer, pack: AudioPack, state: RunState, record: FiredRecord): void => {
  const event = pack.events.find((e) => e.id === record.eventId);
  if (!event) return;
  const store = usePackStore.getState();
  const { take } = record;
  const offline = store.soundFor(event, take);
  const under = event.under ? (store.uriFor(event.under) ?? undefined) : undefined;
  const sound = soundOf(usePrefs.getState().voice, event, offline);
  const text = captionFor(event, store.captions, take);
  useSaid.getState().add({ key: record.key, event, text, distanceM: record.distanceM, elapsedMs: record.elapsedMs, sound, uri: offline, at: Date.now() });
  if (sound === 'silenced') return;
  if (takeOf(event, take)?.personal?.phase !== 'live') {
    if (offline) player.play(event, offline, under);
    return;
  }
  void liveSound(pack, event, state, useSession.getState().token, take).then((live) => {
    const uri = live?.url ?? offline;
    if (!uri || useRun.getState().pack !== pack || stoppedByRunner(useRun.getState().state)) return;
    if (live) useSaid.getState().update(record.key, { uri, sound: 'heard', ...(live.caption ? { text: live.caption } : {}) });
    player.play(event, uri, under);
  });
};

/** The runner ended the run before the line: nothing more is said (a finish still is, to its end). */
const stoppedByRunner = (state: RunState): boolean => state.phase === 'abandoned';

/** `draining`: the run is over and gone from the store, its last lines are playing out. */
type Binding = { player: EventPlayer; unsubscribe: () => void; draining: boolean };

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
  if (binding && !binding.draining) return;
  // A new run screen: the last run's finish, still playing out, gives way.
  releasePlayback();
  const player = createEventPlayer(
    (item) => {
      useSaid.getState().setSpeaking(item?.event.id ?? null);
      if (!item && binding?.player === player && binding.draining) binding = null;
    },
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
      if (crossedTheLine(prev.state)) {
        if (screens === 0) letFinish();
        return;
      }
      player.stop();
      if (screens === 0) releasePlayback();
    }
  });
  binding = { player, unsubscribe, draining: false };
};

/** The run ended on the line, not stopped short: what it says there is the race's last word. */
const crossedTheLine = (state: RunState): boolean => state.phase === 'finished';

/**
 * The run is over and its screen gone (« Accueil » pressed during the finish): the finish lines
 * and the crowd under them play to their end, nothing new is taken, and the binding goes when
 * the voice falls quiet. Cutting them there made the end of the race feel short.
 */
const letFinish = (): void => {
  if (!binding || binding.draining) return;
  binding.unsubscribe();
  if (!binding.player.busy()) {
    binding = null;
    return;
  }
  binding.draining = true;
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

/**
 * A run screen unmounts: the sound stops unless a run is on (the countdown or the race), which
 * keeps its voice, or has just crossed the line, whose finish plays to its end.
 */
export const screenUnmounted = (): void => {
  screens = Math.max(0, screens - 1);
  const { phase, state } = useRun.getState();
  if (screens > 0 || phase === 'running' || phase === 'countdown') return;
  if (phase === 'finished' && crossedTheLine(state)) letFinish();
  else releasePlayback();
};

/** Plays a line again, now, over whatever is speaking. Its ambiance does not come back. */
export const replay = (line: SaidLine): void => {
  if (binding && line.uri) binding.player.play({ ...line.event, mix: 'interrupt', priority: 10 }, line.uri);
};
