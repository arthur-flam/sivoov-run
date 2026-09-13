import { useEffect, useMemo } from 'react';
import type { AudioPack, Course } from '@sivoov/shared';
import { useRun } from '@/stores/run';
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
 * keeps the caption and the trace; this hook only turns firings into sound. Template
 * events (splits) have no file yet and stay caption-only.
 */
export const useAudioPlayback = (): void => {
  useEffect(() => {
    const player = createEventPlayer();
    void configureAudioSession();
    const unsubscribe = useRun.subscribe((s, prev) => {
      if (s.fired === prev.fired || !s.pack) return;
      const pack = s.pack;
      s.fired.slice(prev.fired.length).forEach((record) => {
        const event = pack.events.find((e) => e.id === record.eventId);
        const uri = event?.source.kind === 'file' ? usePackStore.getState().uriFor(event.source.key) : null;
        if (event && uri) player.play(event, uri);
      });
      if (s.phase === 'idle' && prev.phase !== 'idle') player.stop();
    });
    return () => {
      unsubscribe();
      player.stop();
    };
  }, []);
};
