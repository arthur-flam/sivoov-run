import { useEffect } from 'react';
import type { Course } from '@sivoov/shared';
import { usePackStore } from '@/audio/packStore';
import type { PackStatus } from '@/audio/packStore';

export type PackDownload = { status: PackStatus; bytes: number; retry: () => void };

/**
 * Starts the audio pack download as soon as the runner has a course (race home, pre-flight),
 * so the pack is on the phone before the start line, and says how it went.
 */
export const usePackDownload = (course: Course | null): PackDownload => {
  const status = usePackStore((s) => s.status);
  const bytes = usePackStore((s) => s.bytes);
  const load = () => {
    if (course) void usePackStore.getState().load(course);
  };
  // Keyed on the id: a refreshed profile carrying the same course must not reload anything.
  useEffect(load, [course?.id]);
  return { status, bytes, retry: load };
};
