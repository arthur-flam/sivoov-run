/**
 * Seeds a D1 database and the R2 bucket with the races we run by hand (Deauville, the 10 km des
 * Champs-Élysées), or one of them.
 *   npm run seed -w api -- local|preview|production [raceId]
 * Idempotent and insert-only for what organizers edit in the admin: an existing race, course,
 * script draft or team member is left as it is (colors, logo, places, GPX, roles). Test
 * entrants are upserted. The seed's own geometry object is rewritten, and a course whose GPX was
 * replaced in the admin no longer points at it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { champsElysees10kGeometry, deauvilleMarathonGeometry } from '@sivoov/shared';
import type { AudioScript, Course, CourseGeometry, Entrant, Organizer, PhotoMoment, Race } from '@sivoov/shared';
import { champsElyseesCourses, champsElyseesOrganizers, champsElyseesPhotoMoments, champsElyseesRace, champsElyseesScripts, champsElyseesTestEntrants } from '../src/seed/champsElysees';
import { deauvilleCourses, deauvilleOrganizers, deauvillePhotoMoments, deauvilleRace, deauvilleScripts, deauvilleTestEntrants } from '../src/seed/deauville';

type Seed = { race: Race; courses: Course[]; entrants: Entrant[]; organizers: Organizer[]; scripts: AudioScript[]; moments: PhotoMoment[]; geometries: { key: string; geometry: CourseGeometry }[] };

const SEEDS: Seed[] = [
  {
    race: deauvilleRace, courses: deauvilleCourses, entrants: deauvilleTestEntrants, organizers: deauvilleOrganizers, scripts: deauvilleScripts, moments: deauvillePhotoMoments,
    geometries: [{ key: 'courses/deauville-2026-marathon.json', geometry: deauvilleMarathonGeometry }],
  },
  {
    race: champsElyseesRace, courses: champsElyseesCourses, entrants: champsElyseesTestEntrants, organizers: champsElyseesOrganizers, scripts: champsElyseesScripts, moments: champsElyseesPhotoMoments,
    geometries: [{ key: champsElyseesCourses[0]!.geometryKey!, geometry: champsElysees10kGeometry }],
  },
];

const target = process.argv[2] ?? 'local';
if (!['local', 'preview', 'production'].includes(target)) throw new Error('usage: seed.ts local|preview|production [raceId]');
const only = process.argv[3];
const seeds = SEEDS.filter((s) => !only || s.race.id === only);
if (seeds.length === 0) throw new Error(`no seed for ${only}; known: ${SEEDS.map((s) => s.race.id).join(', ')}`);

const q = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`);
const sqlFor = ({ race: r, courses, entrants, organizers, scripts, moments }: Seed) => [
  `INSERT INTO races (id, slug, name, city, country, date_start, date_end, window_start, window_end, timezone, organizer_url, theme, status)
   VALUES (${[r.id, r.slug, r.name, r.city, r.country, r.dateStart, r.dateEnd, r.windowStart, r.windowEnd, r.timezone, r.organizerUrl ?? null, JSON.stringify(r.theme), r.status].map(q).join(', ')})
   ON CONFLICT(id) DO NOTHING;`,
  ...courses.map(
    (c) => `INSERT INTO courses (id, race_id, distance_key, distance_m, geometry_key, landmarks)
   VALUES (${[c.id, c.raceId, c.distanceKey, c.distanceM, c.geometryKey ?? null, JSON.stringify(c.landmarks)].map(q).join(', ')})
   ON CONFLICT(id) DO NOTHING;`,
  ),
  ...(target === 'production' ? [] : entrants).map(
    (e) => `INSERT INTO entrants (id, race_id, bib, email, first_name, last_name, distance_key, source)
   VALUES (${[e.id, e.raceId, e.bib, e.email, e.firstName, e.lastName, e.distanceKey, e.source].map(q).join(', ')})
   ON CONFLICT(race_id, bib) DO UPDATE SET email=excluded.email, first_name=excluded.first_name, last_name=excluded.last_name, distance_key=excluded.distance_key;`,
  ),
  // The studio draft: version = (latest published pack) + 1, and never over an existing draft.
  ...scripts.map(
    (script) => `INSERT INTO audio_scripts (course_id, locale, version, script, updated_at)
   VALUES (${[script.courseId, script.locale].map(q).join(', ')},
     COALESCE((SELECT MAX(version) FROM audio_packs WHERE course_id = ${q(script.courseId)} AND locale = ${q(script.locale)}), 0) + 1,
     ${q(JSON.stringify(script))}, ${q(new Date().toISOString())})
   ON CONFLICT(course_id, locale) DO NOTHING;`,
  ),
  // Photo moments to start from, never on production (the organizer's own there), never over an edit.
  ...(target === 'production' ? [] : moments).map(
    (m) => `INSERT INTO photo_moments (id, race_id, title, at, ask, scene, refs, sort, created_at)
   VALUES (${[m.id, m.raceId, m.title, m.at, m.ask, m.scene, JSON.stringify(m.refs), m.sort, m.createdAt].map(q).join(', ')})
   ON CONFLICT(id) DO NOTHING;`,
  ),
  ...organizers
    .filter((o) => target !== 'production' || !o.email.endsWith('@example.com'))
    .map(
      (o) =>
        `INSERT INTO organizers (id, race_id, email, role, created_at) VALUES (${[o.id, o.raceId, o.email, o.role, new Date().toISOString()].map(q).join(', ')}) ON CONFLICT(race_id, email) DO NOTHING;`,
    ),
];
const sql = seeds.flatMap(sqlFor).join('\n');

const dir = mkdtempSync(join(tmpdir(), 'sivoov-seed-'));
const sqlFile = join(dir, 'seed.sql');
writeFileSync(sqlFile, sql);

const envFlag = target === 'local' ? ['--env', 'local'] : target === 'preview' ? ['--env', 'preview'] : [];
const dbName = target === 'preview' ? 'sivoov-run-preview' : 'sivoov-run';
const bucket = target === 'preview' ? 'sivoov-run-files-preview' : 'sivoov-run-files';
const where = target === 'local' ? ['--local'] : ['--remote'];
const run = (args: string[]) => {
  console.log('> wrangler', args.join(' '));
  execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname });
};
run(['d1', 'execute', dbName, ...where, ...envFlag, '--file', sqlFile]);
seeds.flatMap((s) => s.geometries).forEach(({ key, geometry }, i) => {
  const geoFile = join(dir, `geometry-${i}.json`);
  writeFileSync(geoFile, JSON.stringify(geometry));
  run(['r2', 'object', 'put', `${bucket}/${key}`, '--file', geoFile, '--content-type', 'application/json', ...(target === 'local' ? ['--local', '--env', 'local'] : ['--remote'])]);
});
console.log(`seeded ${target}: ${seeds.map((s) => s.race.id).join(', ')}`);
