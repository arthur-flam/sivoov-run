import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { CourseGeometrySchema, buildTrack, champsElysees10kGeometry, deauvilleMarathonGeometry } from '@sivoov/shared';
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

const samePoints = (a: CourseGeometry, b: CourseGeometry): boolean => JSON.stringify(a.points) === JSON.stringify(b.points);

/** The traces the app ships with, for the race they belong to (a demo race runs on the real race's courses). */
const bundledFor = (course: Pick<Course, 'raceId'>): CourseGeometry | null =>
  [deauvilleMarathonGeometry, champsElysees10kGeometry].find((g) => g.courseId.startsWith(`${course.raceId}-`)) ?? null;

/**
 * The course geometry kept on the phone at once (a weak signal must not hold the screen for the
 * network), then the API's, kept for the next start with no signal and shown only if the course
 * changed. Offline with nothing kept: the trace the app ships with for that race, if any; never
 * another race's course.
 */
export const useTrack = (course: Course | null): CourseTrack | null => {
  const [track, setTrack] = useState<CourseTrack | null>(null);
  // Keyed on the course's id: a refreshed session hands over a new object for the same course.
  const courseId = course?.id ?? null;
  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    const show = (g: CourseGeometry) => {
      if (!cancelled) setTrack(buildTrack(g.points));
    };
    void (async () => {
      const kept = await geometryCache.read(course.id);
      if (kept) show(kept);
      const fetched = await api.geometry(course.id).catch(() => null);
      if (fetched) {
        void geometryCache.write(fetched);
        if (!kept || !samePoints(kept, fetched)) show(fetched);
      } else if (!kept) {
        const bundled = bundledFor(course);
        if (bundled) show(bundled);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);
  return track;
};
