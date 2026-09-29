import { useEffect, useMemo } from 'react';
import type { AudioPack, Course } from '@sivoov/shared';
import { packV0 } from './pack';
import { usePackStore } from './packStore';
import { screenMounted, screenUnmounted } from './playback';

export { replay } from './playback';

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
 * Plays every event the run store fires (playback.ts). The binding is made when the run screen
 * mounts and outlives it while a run is on: on Android the screen can go (the app swiped away)
 * while the run and its voice go on; a screen mounted again reuses it.
 */
export const useAudioPlayback = (): void => {
  useEffect(() => {
    screenMounted();
    return screenUnmounted;
  }, []);
};
