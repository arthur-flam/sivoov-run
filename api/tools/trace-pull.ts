/**
 * Lists the runs of an environment, and pulls a run's GPS trace out of R2 so a test can
 * replay it (WORKFLOW.md, loop 3).
 *   npm run trace:pull -w api -- local|preview|production            # list recent runs
 *   npm run trace:pull -w api -- local|preview|production <run-id>   # write .traces/<run-id>.json
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [target = 'local', runId] = process.argv.slice(2);
if (!['local', 'preview', 'production'].includes(target)) throw new Error('usage: trace-pull.ts local|preview|production [run-id]');

const cwd = new URL('..', import.meta.url).pathname;
const envFlag = target === 'production' ? [] : ['--env', target];
const dbName = target === 'preview' ? 'sivoov-run-preview' : 'sivoov-run';
const bucket = target === 'preview' ? 'sivoov-run-files-preview' : 'sivoov-run-files';
const where = target === 'local' ? '--local' : '--remote';
const wrangler = (args: string[], capture = false) =>
  execFileSync('npx', ['wrangler', ...args], { cwd, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });

if (!runId) {
  const sql =
    'SELECT r.id, r.status, r.started_at, round(r.distance_m/1000.0, 2) AS km, round(r.elapsed_ms/60000.0, 1) AS minutes,'
    + ' e.bib, r.trace_key IS NOT NULL AS trace FROM runs r JOIN entrants e ON e.id = r.entrant_id ORDER BY r.started_at DESC LIMIT 20;';
  wrangler(['d1', 'execute', dbName, where, ...envFlag, '--command', sql]);
  console.log('\npull one with: npm run trace:pull -w api -- ' + target + ' <run-id>');
} else {
  const key = `traces/deauville-2026/${runId}.json`;
  const dir = join(cwd, '..', '.traces');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${runId}.json`);
  wrangler(['r2', 'object', 'get', `${bucket}/${key}`, '--file', out, ...(target === 'local' ? ['--local', '--env', 'local'] : ['--remote'])]);
  console.log(`wrote ${out}`);
}
