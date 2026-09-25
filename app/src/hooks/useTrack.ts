import { useEffect, useState } from 'react';
import { buildTrack, deauvilleMarathonGeometry } from '@sivoov/shared';
import type { Course, CourseTrack } from '@sivoov/shared';
import { api } from '@/api';

/** Loads the course geometry once; falls back to the bundled Deauville trace offline. */
export const useTrack = (course: Course | null): CourseTrack | null => {
  const [track, setTrack] = useState<CourseTrack | null>(null);
  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    api
      .geometry(course.id)
      .then((g) => !cancelled && setTrack(buildTrack(g.points)))
      .catch(() => !cancelled && setTrack(buildTrack(deauvilleMarathonGeometry.points)));
    return () => {
      cancelled = true;
    };
  }, [course]);
  return track;
};
