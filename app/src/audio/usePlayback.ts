import { useEffect, useMemo } from 'react';
import type { AudioPack, Course } from '@sivoov/shared';
import { useRun } from '@/stores/run';
import { usePrefs } from '@/stores/prefs';
import { useSession } from '@/stores/session';
import { liveSound } from './live';
import { packV0 } from './pack';
import { usePackStore } from './packStore';
import { configureAudioSession, createEventPlayer } from './player';
import type { EventPlayer } from './player';
import { captionFor, soundOf, useSaid } from './said';
import type { SaidLine } from './said';

/** The pack the run should use: the published one once loaded, the v0 event list meanwhile. */
export const useAudioPack = (course: Course | null): AudioPack | null => {
  const load = usePackStore((s) => s.load);
  const pack = usePackStore((s) => s.pack);
  useEffect(() => {
    if (course) void load(course);
  }, [course, load]);
  return useMemo(() => pack ?? (course ? packV0(course) : null), [pack, course]);
};

/** The run screen's player while it is mounted, for « Réécouter ». */
let active: EventPlayer | null = null;

/** Plays a line again, now, over whatever is speaking. Its ambiance does not come back. */
export const replay = (line: SaidLine): void => {
  if (active && line.uri) active.play({ ...line.event, mix: 'interrupt', priority: 10 }, line.uri);
};

/**
 * Plays every event the run store fires, for as long as the screen is mounted, and writes each
 * one to the list the screen reads (`useSaid`): its words, and whether it was heard. The runner's
 * voice level (« moins de voix ») skips a line's sound, never its place in the list. The sound is
 * the runner's own version of a personal line when there is one (downloaded before the start, or
 * said live), the pack's file otherwise; events with no file at all are read, not heard.
 */
export const useAudioPlayback = (): void => {
  useEffect(() => {
    const player = createEventPlayer((item) => useSaid.getState().setSpeaking(item?.event.id ?? null));
    active = player;
    void configureAudioSession();
    const unsubscribe = useRun.subscribe((s, prev) => {
      if (s.fired === prev.fired || !s.pack) return;
      const pack = s.pack;
      const store = usePackStore.getState();
      const said = useSaid.getState();
      s.fired.slice(prev.fired.length).forEach((record) => {
        const event = pack.events.find((e) => e.id === record.eventId);
        if (!event) return;
        const offline = store.soundFor(event);
        const under = event.under ? (store.uriFor(event.under) ?? undefined) : undefined;
        const sound = soundOf(usePrefs.getState().voice, event, offline);
        said.add({ key: record.key, event, text: captionFor(event, store.captions), distanceM: record.distanceM, elapsedMs: record.elapsedMs, sound, uri: offline, at: Date.now() });
        if (sound === 'silenced') return;
        if (event.personal?.phase !== 'live') {
          if (offline) player.play(event, offline, under);
          return;
        }
        void liveSound(pack, event, s.state, useSession.getState().token).then((live) => {
          const uri = live?.url ?? offline;
          if (!uri || useRun.getState().pack !== pack) return;
          if (live) useSaid.getState().update(record.key, { uri, sound: 'heard', ...(live.caption ? { text: live.caption } : {}) });
          player.play(event, uri, under);
        });
      });
      if (s.phase === 'idle' && prev.phase !== 'idle') player.stop();
    });
    return () => {
      unsubscribe();
      player.stop();
      if (active === player) active = null;
    };
  }, []);
};
