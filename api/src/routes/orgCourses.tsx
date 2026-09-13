import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { CourseGeometrySchema, CourseSchema, DistanceKeySchema, buildTrack, parseGpx } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { scriptDb } from '../db/scriptQueries';
import { requireCourse, requireOrganizer } from '../lib/orgAuth';
import type { CourseVars } from '../lib/orgAuth';
import { DEFAULT_PACE_SEC_PER_KM, geometryKeyFor, loadGeometry, loadStudioContext, paceFromQuery, studioPageData, trackFor } from '../lib/studio';
import { Layout } from '../pages/layout';
import { OrgCoursesPage } from '../pages/org/courses';
import type { CourseCard } from '../pages/org/courses';
import { OrgStudioPage } from '../pages/org/studio';

/** Courses and the audio studio, inside the organizer session. Mounted under /org. */
export const orgCourses = new Hono<AppEnv & { Variables: CourseVars }>();

const NewCourseSchema = z.object({
  distanceKey: DistanceKeySchema,
  distanceM: z.coerce.number().positive().max(200_000),
});

const cardsFor = async (env: AppEnv['Bindings'], raceId: string): Promise<CourseCard[]> => {
  const courses = await db(env.DB).coursesForRace(raceId);
  const scripts = scriptDb(env.DB);
  return Promise.all(
    courses.map(async (course): Promise<CourseCard> => {
      const [geometry, draft, packs] = await Promise.all([loadGeometry(env.FILES, course), scripts.draft(course.id), scripts.packs(course.id)]);
      const track = trackFor(geometry);
      return {
        course,
        measuredM: track ? Math.round(track.totalM) : null,
        draft: draft ? { version: draft.version, updatedAt: draft.updatedAt, lines: draft.script.lines.length } : null,
        pack: packs[0] ?? null,
      };
    }),
  );
};

type CoursesContext = Context<AppEnv & { Variables: CourseVars }>;

const coursesPage = async (c: CoursesContext, state: { error?: string; notice?: string } = {}) => {
  const race = c.get('race');
  return c.html(
    <Layout title={`Parcours · ${race.theme.displayName}`} locale="fr" race={race} path={`/org/${race.slug}/courses`}>
      <OrgCoursesPage race={race} organizer={c.get('organizer')} cards={await cardsFor(c.env, race.id)} {...state} />
    </Layout>,
  );
};

orgCourses.get('/:slug/courses', requireOrganizer, (c) => coursesPage(c));

/** A new course of the race: id is `<race>-<distanceKey>`, so it is stable and readable. */
orgCourses.post('/:slug/courses', requireOrganizer, async (c) => {
  const race = c.get('race');
  const form = await c.req.parseBody();
  const parsed = NewCourseSchema.safeParse({ distanceKey: form.distanceKey, distanceM: form.distanceM });
  if (!parsed.success) return coursesPage(c, { error: 'Épreuve ou distance invalide.' });
  const existing = await db(c.env.DB).courseFor(race.id, parsed.data.distanceKey);
  if (existing) return coursesPage(c, { error: 'Cette épreuve a déjà un parcours.' });
  const course = CourseSchema.parse({
    id: `${race.slug}-${parsed.data.distanceKey}`,
    raceId: race.id,
    distanceKey: parsed.data.distanceKey,
    distanceM: parsed.data.distanceM,
    landmarks: [],
  });
  await db(c.env.DB).upsertCourse(course);
  return c.redirect(`/org/${race.slug}/courses/${course.id}`);
});

/**
 * The organizer's GPX becomes the course geometry: parsed here, stored as JSON in R2 at
 * `courses/<courseId>/geometry.json`, and the course row points at it. Replacing it is the
 * normal case (the app only falls back to the bundled trace when the API has none).
 */
orgCourses.post('/:slug/courses/:courseId/gpx', requireOrganizer, requireCourse, async (c) => {
  const race = c.get('race');
  const course = c.get('course');
  const form = await c.req.parseBody();
  const file = form.gpx;
  if (!(file instanceof File) || file.size === 0) return coursesPage(c, { error: 'Aucun fichier GPX reçu.' });
  const { points } = parseGpx(await file.text());
  const geometry = CourseGeometrySchema.safeParse({ courseId: course.id, points });
  if (!geometry.success) return coursesPage(c, { error: `GPX illisible : ${points.length} point(s) trouvé(s), il en faut au moins deux.` });
  const key = geometryKeyFor(course.id);
  await c.env.FILES.put(key, JSON.stringify(geometry.data), { httpMetadata: { contentType: 'application/json' } });
  await db(c.env.DB).setGeometryKey(course.id, key);
  const measured = Math.round(buildTrack(geometry.data.points).totalM);
  return c.redirect(`/org/${race.slug}/courses/${course.id}#gpx-${measured}`);
});

/** The studio. `?pace=` seconds per km drives the estimates, 5:30 by default. */
orgCourses.get('/:slug/courses/:courseId', requireOrganizer, requireCourse, async (c) => {
  const race = c.get('race');
  const course = c.get('course');
  const ctx = await loadStudioContext(c.env, course);
  const pace = c.req.query('pace') ? paceFromQuery(c.req.query('pace')) : DEFAULT_PACE_SEC_PER_KM;
  const full = await studioPageData(c.env, course, ctx, pace);
  // `?map=svg` forces the schematic fallback: no tiles, no network — the screenshot rig uses it.
  const data = c.req.query('map') === 'svg' ? { ...full, mapboxToken: null } : full;
  return c.html(
    <Layout title={`Studio · ${race.theme.displayName}`} locale="fr" race={race} path={`/org/${race.slug}/courses/${course.id}`}>
      <OrgStudioPage race={race} organizer={c.get('organizer')} course={course} data={data} />
    </Layout>,
  );
});
