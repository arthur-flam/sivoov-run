import { z } from 'zod';
import { DistanceKeySchema } from './race';

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

/** A place on the course, positioned by distance along it. What the announcer talks about. */
export const LandmarkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  meters: z.number().nonnegative(),
  description: z.string().optional(),
});
export type Landmark = z.infer<typeof LandmarkSchema>;

/** The course row: identity and metadata. Geometry lives in R2, see CourseGeometrySchema. */
export const CourseSchema = z.object({
  id: z.string().min(1),
  raceId: z.string().min(1),
  distanceKey: DistanceKeySchema,
  /** Official distance the runner must complete, in meters. */
  distanceM: z.number().positive(),
  /** R2 key of the geometry JSON (CourseGeometry). */
  geometryKey: z.string().optional(),
  landmarks: z.array(LandmarkSchema).default([]),
});
export type Course = z.infer<typeof CourseSchema>;

/** Polyline of the real course, ordered from start to finish. */
export const CourseGeometrySchema = z.object({
  courseId: z.string().min(1),
  points: z.array(LatLngSchema).min(2),
});
export type CourseGeometry = z.infer<typeof CourseGeometrySchema>;
