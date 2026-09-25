import { Hono } from 'hono';
import type { Context } from 'hono';
import { CourseGeometrySchema, CourseSchema, DISTANCE_METERS, DistanceKeySchema, can, metersFromKm, parseGpx } from '@sivoov/shared';
import type { AppEnv } from '../env';
import { db } from '../db/queries';
import { scriptDb } from '../db/scriptQueries';
import { requireCan, requireCourse, requireOrganizer } from '../lib/orgAuth';
import type { CourseVars } from '../lib/orgAuth';
import { publishScript } from '../lib/publish';
import { DEFAULT_PACE_SEC_PER_KM, courseAudioCard, geometryKeyFor, loadStudioContext, paceFromQuery, studioPageData } from '../lib/studio';
import { OrgCoursesPage } from '../pages/org/courses';
import type { NewCourseForm } from '../pages/org/courses';
import { OrgStudioPage } from '../pages/org/studio';
import { doneMessage, orgPage } from './orgPage';

/** Courses and the audio studio, inside the organizer session. Mounted under /org. */
export const orgCourses = new Hono<AppEnv & { Variables: CourseVars }>();

type CoursesContext = Context<AppEnv & { Variables: CourseVars }>;

const DONE: Record<string, string> = {
  gpx: 'Tracé importé. Vérifiez sa longueur ci-dessous.',
  published: 'Annonces publiées. Les coureurs les reçoivent la prochaine fois qu’ils ouvrent l’application.',
  landmarks: 'Lieux du parcours enregistrés.',
};

type PageState = { error?: string; form?: NewCourseForm; status?: 400 | 409 | 422 };

const coursesPage = async (c: CoursesContext, state: PageState = {}) => {
  const race = c.get('race');
  const courses = await db(c.env.DB).coursesForRace(race.id);
  const cards = await Promise.all(courses.map((course) => courseAudioCard(c.env, course)));
  return orgPage(
    c,
    'courses',
    'Parcours et annonces',
    <OrgCoursesPage race={race} access={c.get('access')} cards={cards} done={doneMessage(c, DONE)} error={state.error} form={state.form} />,
    { status: state.status },
  );
};

orgCourses.get('/:slug/courses', requireOrganizer, (c) => coursesPage(c));

/**
 * A new distance of the race: id is `<race>-<distanceKey>`, so it is stable and readable.
 * The official distance is typed in km; left empty, it is the standard one for the distance.
 */
orgCourses.post('/:slug/courses', requireOrganizer, requireCan('edit_audio'), async (c) => {
  const race = c.get('race');
  const body = await c.req.parseBody();
  const form: NewCourseForm = { distanceKey: String(body.distanceKey ?? ''), distanceKm: String(body.distanceKm ?? '').trim() };
  const key = DistanceKeySchema.safeParse(form.distanceKey);
  if (!key.success) return coursesPage(c, { form, error: 'Choisissez une distance.', status: 400 });
  const meters = form.distanceKm === '' ? DISTANCE_METERS[key.data] : metersFromKm(form.distanceKm);
  if (meters === null || meters < 100 || meters > 200_000) {
    return coursesPage(c, { form: { ...form, fieldError: 'Écrivez la distance en kilomètres, par exemple 42,195.' }, status: 400 });
  }
  if (await db(c.env.DB).courseFor(race.id, key.data)) return coursesPage(c, { form, error: 'Cette distance a déjà un parcours.', status: 409 });
  const course = CourseSchema.parse({ id: `${race.slug}-${key.data}`, raceId: race.id, distanceKey: key.data, distanceM: meters, landmarks: [] });
  await db(c.env.DB).upsertCourse(course);
  return c.redirect(`/org/${race.slug}/courses/${course.id}`);
});

/**
 * The organizer's GPX becomes the course geometry: parsed here, stored as JSON in R2 at
 * `courses/<courseId>/geometry.json`, and the course row points at it. Replacing it is the
 * normal case. Back on the courses page, the card compares its length with the official one.
 */
orgCourses.post('/:slug/courses/:courseId/gpx', requireOrganizer, requireCan('edit_audio'), requireCourse, async (c) => {
  const race = c.get('race');
  const course = c.get('course');
  const form = await c.req.parseBody();
  const file = form.gpx;
  if (!(file instanceof File) || file.size === 0) return coursesPage(c, { error: 'Choisissez d’abord le fichier GPX du parcours.', status: 400 });
  const { points } = parseGpx(await file.text());
  const geometry = CourseGeometrySchema.safeParse({ courseId: course.id, points });
  if (!geometry.success) {
    return coursesPage(c, { error: 'Ce fichier ne contient pas de tracé lisible. Vérifiez qu’il s’agit bien d’un fichier GPX du parcours.', status: 422 });
  }
  const key = geometryKeyFor(course.id);
  await c.env.FILES.put(key, JSON.stringify(geometry.data), { httpMetadata: { contentType: 'application/json' } });
  await db(c.env.DB).setGeometryKey(course.id, key);
  return c.redirect(`/org/${race.slug}/courses?done=gpx#${course.id}`);
});

/** "Publier les changements" from a course card: the same publish as the studio's, as a form. */
orgCourses.post('/:slug/courses/:courseId/publish', requireOrganizer, requireCan('edit_audio'), requireCourse, async (c) => {
  const race = c.get('race');
  const ctx = await loadStudioContext(c.env, c.get('course'));
  if (ctx.script.lines.length === 0) return coursesPage(c, { error: 'Ajoutez une annonce avant de publier.', status: 409 });
  const outcome = await publishScript({ db: db(c.env.DB), scripts: scriptDb(c.env.DB), files: c.env.FILES }, ctx.script);
  if (!outcome.ok) return coursesPage(c, { error: `Publication impossible : il manque le son de ${outcome.missing.map((m) => m.title || m.id).join(', ')}.`, status: 409 });
  return c.redirect(`/org/${race.slug}/courses?done=published#${c.get('course').id}`);
});

/** The studio. `?pace=` seconds per km drives the estimates, 5:30 by default. */
orgCourses.get('/:slug/courses/:courseId', requireOrganizer, requireCourse, async (c) => {
  const race = c.get('race');
  const course = c.get('course');
  const ctx = await loadStudioContext(c.env, course);
  const pace = c.req.query('pace') ? paceFromQuery(c.req.query('pace')) : DEFAULT_PACE_SEC_PER_KM;
  const full = await studioPageData(c.env, course, ctx, pace, { timezone: race.timezone, canEdit: can(c.get('access'), 'edit_audio') });
  // `?map=svg` forces the schematic fallback: no tiles, no network. The screenshot rig uses it.
  const data = c.req.query('map') === 'svg' ? { ...full, mapboxToken: null } : full;
  return orgPage(c, 'courses', 'Annonces', <OrgStudioPage race={race} course={course} data={data} />);
});
