/**
 * Pushes rendered MP3s and the manifest to R2 (`packs/<courseId>/<version>/<key>`) and
 * upserts the `audio_packs` row through wrangler, for local, preview or production.
 * The manifest stores keys; the API turns them into URLs when it serves the pack.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AudioPackSchema } from '@sivoov/shared';
import type { AudioPack } from '@sivoov/shared';
import type { BuiltScript } from './script';
import type { Rendered } from './tts';

export type Target = 'local' | 'preview' | 'production';
export const isTarget = (s: string | undefined): s is Target => s === 'local' || s === 'preview' || s === 'production';

const API_DIR = new URL('../../', import.meta.url).pathname;
export const packPrefix = (courseId: string, version: number) => `packs/${courseId}/${version}`;

/** The manifest the API stores: file URLs are relative keys, resolved per environment at serve time. */
export const manifestFor = (script: BuiltScript, rendered: Rendered[]): AudioPack =>
  AudioPackSchema.parse({
    courseId: script.courseId,
    version: script.version,
    locale: script.locale,
    events: script.events,
    files: Object.fromEntries(rendered.map((r) => [r.key, { url: `${packPrefix(script.courseId, script.version)}/${r.key}`, bytes: r.bytes, sha256: r.sha256 }])),
  });

const q = (v: string | number) => (typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`);

export const upsertSql = (pack: AudioPack): string =>
  `INSERT INTO audio_packs (id, course_id, version, locale, manifest)
   VALUES (${[`${pack.courseId}/${pack.version}/${pack.locale}`, pack.courseId, pack.version, pack.locale, JSON.stringify(pack)].map(q).join(', ')})
   ON CONFLICT(course_id, version, locale) DO UPDATE SET manifest=excluded.manifest;`;

const wrangler = (args: string[]) => {
  console.log('> wrangler', args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}…` : a)).join(' '));
  execFileSync('npx', ['wrangler', ...args], { stdio: 'inherit', cwd: API_DIR });
};

export const uploadPack = (target: Target, pack: AudioPack, rendered: Rendered[]): void => {
  const bucket = target === 'preview' ? 'sivoov-run-files-preview' : 'sivoov-run-files';
  const dbName = target === 'preview' ? 'sivoov-run-preview' : 'sivoov-run';
  const envFlag = target === 'production' ? [] : ['--env', target];
  const where = target === 'local' ? ['--local'] : ['--remote'];
  const prefix = packPrefix(pack.courseId, pack.version);

  rendered.forEach((r) => wrangler(['r2', 'object', 'put', `${bucket}/${prefix}/${r.key}`, '--file', r.path, '--content-type', 'audio/mpeg', ...where, ...envFlag]));

  const dir = mkdtempSync(join(tmpdir(), 'sivoov-audio-'));
  const manifestFile = join(dir, 'manifest.json');
  const sqlFile = join(dir, 'pack.sql');
  writeFileSync(manifestFile, JSON.stringify(pack));
  writeFileSync(sqlFile, upsertSql(pack));
  wrangler(['r2', 'object', 'put', `${bucket}/${prefix}/manifest.json`, '--file', manifestFile, '--content-type', 'application/json', ...where, ...envFlag]);
  wrangler(['d1', 'execute', dbName, ...where, ...envFlag, '--file', sqlFile]);
};
