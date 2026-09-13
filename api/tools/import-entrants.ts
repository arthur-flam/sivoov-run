/**
 * Imports an organizer CSV into a D1 database, same parser and same upsert as /org/:slug/import.
 *   npm run import:entrants -w api -- local|preview|production <file.csv> [race-slug]
 * Idempotent on (race, bib). Rejected lines are printed and skipped; the rest is written in one file.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEntrantsCsv } from '@sivoov/shared';

const [target = 'local', file, slug = 'deauville-2026'] = process.argv.slice(2);
if (!['local', 'preview', 'production'].includes(target) || !file) throw new Error('usage: import-entrants.ts local|preview|production <file.csv> [race-slug]');

const { entrants, rejected, delimiter } = parseEntrantsCsv(readFileSync(file, 'utf8'));
rejected.forEach((r) => console.error(`line ${r.line}: ${r.reason}${r.detail ? ` (${r.detail})` : ''}`));
if (entrants.length === 0) throw new Error('nothing to import');

const q = (v: string) => `'${v.replaceAll("'", "''")}'`;
const sql = entrants
  .map(
    (e) => `INSERT INTO entrants (id, race_id, bib, email, first_name, last_name, distance_key, source)
   SELECT id || '-' || ${q(e.bib)}, id, ${[e.bib, e.email, e.firstName, e.lastName, e.distanceKey, 'import'].map(q).join(', ')} FROM races WHERE slug = ${q(slug)}
   ON CONFLICT(race_id, bib) DO UPDATE SET email=excluded.email, first_name=excluded.first_name, last_name=excluded.last_name, distance_key=excluded.distance_key;`,
  )
  .join('\n');

const sqlFile = join(mkdtempSync(join(tmpdir(), 'sivoov-import-')), 'entrants.sql');
writeFileSync(sqlFile, sql);
const envFlag = target === 'local' ? ['--env', 'local'] : target === 'preview' ? ['--env', 'preview'] : [];
const dbName = target === 'preview' ? 'sivoov-run-preview' : 'sivoov-run';
const args = ['d1', 'execute', dbName, target === 'local' ? '--local' : '--remote', ...envFlag, '--file', sqlFile];
console.log(`${entrants.length} entrants (${delimiter === ';' ? 'semicolon' : 'comma'} file), ${rejected.length} rejected -> ${slug} on ${target}`);
console.log('> wrangler', args.join(' '));
execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname });
