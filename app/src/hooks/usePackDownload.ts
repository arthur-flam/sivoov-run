import { useEffect } from 'react';
import type { Course } from '@sivoov/shared';
import { usePackStore } from '@/audio/packStore';
import type { PackStatus } from '@/audio/packStore';
import { useSession } from '@/stores/session';

export type PackDownload = { status: PackStatus; bytes: number; retry: () => void };

/**
 * Starts the audio pack download as soon as the runner has a course (race home, pre-flight),
 * so the pack is on the phone before the start line, and says how it went. Then the runner's
 * own lines (their name, what the AI wrote for them) come down beside it; the pre-flight passes
 * where the phone is, rounded, so those lines can say the weather there.
 */
export const usePackDownload = (course: Course | null, here?: { lat: number; lng: number } | null): PackDownload => {
  const status = usePackStore((s) => s.status);
  const bytes = usePackStore((s) => s.bytes);
  const load = () => {
    if (!course) return;
    const token = useSession.getState().token;
    void usePackStore
      .getState()
      .load(course)
      .then(() => (token ? usePackStore.getState().loadPersonal(token, here ?? undefined) : undefined));
  };
  // Keyed on the id (and on the first position): a refreshed profile carrying the same course must not reload anything.
  useEffect(load, [course?.id, here ? `${here.lat},${here.lng}` : null]);
  return { status, bytes, retry: load };
};
