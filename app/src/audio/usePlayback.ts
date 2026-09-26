import { useEffect, useMemo } from 'react';
import type { AudioPack, Course } from '@sivoov/shared';
import { useRun } from '@/stores/run';
import { useSession } from '@/stores/session';
import { liveSound } from './live';
import { packV0 } from './pack';
import { usePackStore } from './packStore';
import { configureAudioSession, createEventPlayer } from './player';

/** The pack the run should use: the published one once loaded, the v0 event list meanwhile. */
export const useAudioPack = (course: Course | null): AudioPack | null => {
  const load = usePackStore((s) => s.load);
  const pack = usePackStore((s) => s.pack);
  useEffect(() => {
    if (course) void load(course);
  }, [course, load]);
  return useMemo(() => pack ?? (course ? packV0(course) : null), [pack, course]);
};

/**
 * Plays every event the run store fires, for as long as the screen is mounted. The store
 * keeps the caption and the trace; this hook only turns firings into sound: the runner's own
 * version of a personal line when there is one (downloaded before the start, or said live),
 * the pack's file otherwise. Events with no file at all stay caption-only.
 */
export const useAudioPlayback = (): void => {
  useEffect(() => {
    const player = createEventPlayer();
    void configureAudioSession();
    const unsubscribe = useRun.subscribe((s, prev) => {
      if (s.fired === prev.fired || !s.pack) return;
      const pack = s.pack;
      const store = usePackStore.getState();
      s.fired.slice(prev.fired.length).forEach((record) => {
        const event = pack.events.find((e) => e.id === record.eventId);
        if (!event) return;
        const offline = store.soundFor(event);
        if (event.personal?.phase !== 'live') {
          if (offline) player.play(event, offline);
          return;
        }
        void liveSound(pack, event, s.state, useSession.getState().token).then((live) => {
          const uri = live ?? offline;
          if (uri && useRun.getState().pack === pack) player.play(event, uri);
        });
      });
      if (s.phase === 'idle' && prev.phase !== 'idle') player.stop();
    });
    return () => {
      unsubscribe();
      player.stop();
    };
  }, []);
};
