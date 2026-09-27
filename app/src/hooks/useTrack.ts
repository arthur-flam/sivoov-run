import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { CourseGeometrySchema, buildTrack, deauvilleMarathonGeometry } from '@sivoov/shared';
import type { Course, CourseGeometry, CourseTrack } from '@sivoov/shared';
import { api } from '@/api';

const keyFor = (courseId: string) => `sivoov.geometry.${courseId}`;

/** The last geometry the API gave for a course: a file on device, `localStorage` on the web. */
const geometryCache = {
  async read(courseId: string): Promise<CourseGeometry | null> {
    try {
      const raw =
        Platform.OS === 'web'
          ? (globalThis.localStorage?.getItem(keyFor(courseId)) ?? null)
          : await import('expo-file-system').then((fs) => {
              const f = new fs.File(fs.Paths.document, `${keyFor(courseId)}.json`);
              return f.exists ? f.text() : null;
            });
      const parsed = raw === null ? null : CourseGeometrySchema.safeParse(JSON.parse(raw));
      return parsed?.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  async write(geometry: CourseGeometry): Promise<void> {
    try {
      const raw = JSON.stringify(geometry);
      if (Platform.OS === 'web') return globalThis.localStorage?.setItem(keyFor(geometry.courseId), raw);
      const fs = await import('expo-file-system');
      new fs.File(fs.Paths.document, `${keyFor(geometry.courseId)}.json`).write(raw);
    } catch {
      // A cache that cannot be written only costs the offline diagram.
    }
  },
};

/**
 * Loads the course geometry and keeps it for the next start with no signal. Offline with
 * nothing kept: the bundled Deauville trace, the only course the app ships with.
 */
export const useTrack = (course: Course | null): CourseTrack | null => {
  const [track, setTrack] = useState<CourseTrack | null>(null);
  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    api
      .geometry(course.id)
      .then((g) => {
        void geometryCache.write(g);
        if (!cancelled) setTrack(buildTrack(g.points));
      })
      .catch(async () => {
        const kept = await geometryCache.read(course.id);
        if (!cancelled) setTrack(buildTrack((kept ?? deauvilleMarathonGeometry).points));
      });
    return () => {
      cancelled = true;
    };
  }, [course]);
  return track;
};
