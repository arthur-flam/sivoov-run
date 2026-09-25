/**
 * Seeds a D1 database and the R2 bucket with the Deauville race.
 *   npm run seed -w api -- local|preview|production
 * Idempotent: rows are upserted, the geometry object is overwritten.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deauvilleMarathonGeometry } from '@sivoov/shared';
import { deauvilleCourses, deauvilleOrganizers, deauvilleRace, deauvilleScripts, deauvilleTestEntrants } from '../src/seed/deauville';

const target = process.argv[2] ?? 'local';
if (!['local', 'preview', 'production'].includes(target)) throw new Error('usage: seed.ts local|preview|production');

const q = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`);
const r = deauvilleRace;
const sql = [
  `INSERT INTO races (id, slug, name, city, country, date_start, date_end, window_start, window_end, timezone, organizer_url, theme, status)
   VALUES (${[r.id, r.slug, r.name, r.city, r.country, r.dateStart, r.dateEnd, r.windowStart, r.windowEnd, r.timezone, r.organizerUrl ?? null, JSON.stringify(r.theme), r.status].map(q).join(', ')})
   ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, name=excluded.name, city=excluded.city, date_start=excluded.date_start, date_end=excluded.date_end,
     window_start=excluded.window_start, window_end=excluded.window_end, organizer_url=excluded.organizer_url, theme=excluded.theme, status=excluded.status;`,
  ...deauvilleCourses.map(
    (c) => `INSERT INTO courses (id, race_id, distance_key, distance_m, geometry_key, landmarks)
   VALUES (${[c.id, c.raceId, c.distanceKey, c.distanceM, c.geometryKey ?? null, JSON.stringify(c.landmarks)].map(q).join(', ')})
   ON CONFLICT(id) DO UPDATE SET distance_m=excluded.distance_m, geometry_key=excluded.geometry_key, landmarks=excluded.landmarks;`,
  ),
  ...(target === 'production' ? [] : deauvilleTestEntrants).map(
    (e) => `INSERT INTO entrants (id, race_id, bib, email, first_name, last_name, distance_key, source)
   VALUES (${[e.id, e.raceId, e.bib, e.email, e.firstName, e.lastName, e.distanceKey, e.source].map(q).join(', ')})
   ON CONFLICT(race_id, bib) DO UPDATE SET email=excluded.email, first_name=excluded.first_name, last_name=excluded.last_name, distance_key=excluded.distance_key;`,
  ),
  // The studio draft: version = (latest published pack) + 1, and never over an existing draft.
  ...deauvilleScripts.map(
    (script) => `INSERT INTO audio_scripts (course_id, locale, version, script, updated_at)
   VALUES (${[script.courseId, script.locale].map(q).join(', ')},
     COALESCE((SELECT MAX(version) FROM audio_packs WHERE course_id = ${q(script.courseId)} AND locale = ${q(script.locale)}), 0) + 1,
     ${q(JSON.stringify(script))}, ${q(new Date().toISOString())})
   ON CONFLICT(course_id, locale) DO NOTHING;`,
  ),
  ...deauvilleOrganizers
    .filter((o) => target !== 'production' || !o.email.endsWith('@example.com'))
    .map(
      (o) =>
        `INSERT INTO organizers (id, race_id, email, role, created_at) VALUES (${[o.id, o.raceId, o.email, o.role, new Date().toISOString()].map(q).join(', ')}) ON CONFLICT(race_id, email) DO NOTHING;`,
    ),
].join('\n');

const dir = mkdtempSync(join(tmpdir(), 'sivoov-seed-'));
const sqlFile = join(dir, 'seed.sql');
const geoFile = join(dir, 'geometry.json');
writeFileSync(sqlFile, sql);
writeFileSync(geoFile, JSON.stringify(deauvilleMarathonGeometry));

const envFlag = target === 'local' ? ['--env', 'local'] : target === 'preview' ? ['--env', 'preview'] : [];
const dbName = target === 'preview' ? 'sivoov-run-preview' : 'sivoov-run';
const bucket = target === 'preview' ? 'sivoov-run-files-preview' : 'sivoov-run-files';
const where = target === 'local' ? ['--local'] : ['--remote'];
const run = (args: string[]) => {
  console.log('> wrangler', args.join(' '));
  execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname });
};
run(['d1', 'execute', dbName, ...where, ...envFlag, '--file', sqlFile]);
run(['r2', 'object', 'put', `${bucket}/courses/deauville-2026-marathon.json`, '--file', geoFile, '--content-type', 'application/json', ...(target === 'local' ? ['--local', '--env', 'local'] : ['--remote'])]);
console.log(`seeded ${target}`);
