/**
 * The Worker's own D1 and R2 for a target, from a laptop: local (wrangler dev's state), or the
 * real preview or production ones through Wrangler's remote bindings. A tool then calls the
 * Worker's code itself (publishing, the studio's queries) instead of mirroring it in SQL and CLI
 * calls, and needs no sign-in: it runs as the account Wrangler is logged in with.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';

export type Target = 'local' | 'preview' | 'production';
export type Bindings = { DB: D1Database; FILES: R2Bucket };

const API_DIR = new URL('../', import.meta.url).pathname;

export const bindingsFor = async (target: Target): Promise<{ env: Bindings; dispose: () => Promise<void> }> => {
  const config = JSON.parse(readFileSync(join(API_DIR, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '')) as Record<string, unknown> & {
    env: Record<string, Record<string, unknown>>;
  };
  const remote = <T extends object>(list: unknown) => (list as T[]).map((b) => ({ ...b, remote: target !== 'local' }));
  // Production is the top level of wrangler.jsonc; the others are environments.
  const { env: envs, ...top } = config;
  const scope = target === 'production' ? top : envs[target]!;
  const file = join(API_DIR, `.wrangler-${target}-${process.pid}.tmp.json`);
  writeFileSync(file, JSON.stringify({ ...top, ...scope, d1_databases: remote(scope.d1_databases), r2_buckets: remote(scope.r2_buckets), env: undefined }));
  try {
    const proxy = await getPlatformProxy<Bindings>({ configPath: file, persist: true });
    return { env: proxy.env, dispose: () => proxy.dispose() };
  } finally {
    rmSync(file, { force: true });
  }
};
