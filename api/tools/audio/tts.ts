/**
 * Renders script lines to MP3 with ElevenLabs. Cached by sha256(text + voice + model) in
 * `api/.cache/audio/`, so re-running a build only pays for changed lines. Concurrency 2 (the
 * plan's limit; `ELEVENLABS_CONCURRENCY` overrides), with a short retry on 429.
 * Template lines (with slots) are skipped: they are rendered on device for now (AUDIO.md).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BuiltScript } from './script';

const ROOT_ENV = new URL('../../../.env', import.meta.url).pathname;
export const CACHE = new URL('../../.cache/audio/', import.meta.url).pathname;

/** The root .env, without a dotenv dependency. process.env wins. */
export const envVar = (name: string): string | undefined => {
  if (process.env[name]) return process.env[name];
  if (!existsSync(ROOT_ENV)) return undefined;
  const line = readFileSync(ROOT_ENV, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') || undefined;
};

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

export type Rendered = { key: string; path: string; bytes: number; sha256: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const renderOne = async (apiKey: string, voice: BuiltScript['voice'], text: string, attempt = 0): Promise<string> => {
  const path = join(CACHE, `${sha256(`${text}|${voice.id}|${voice.model}`)}.mp3`);
  if (existsSync(path)) return path;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: voice.model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 } }),
  });
  if (res.status === 429 && attempt < 5) {
    await sleep(1500 * (attempt + 1));
    return renderOne(apiKey, voice, text, attempt + 1);
  }
  if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
};

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
export const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = new Array<R>(items.length);
  const next = async (cursor: { i: number }): Promise<void> => {
    const i = cursor.i++;
    if (i >= items.length) return;
    results[i] = await fn(items[i]!);
    return next(cursor);
  };
  const cursor = { i: 0 };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next(cursor)));
  return results;
};

export const renderScript = async (script: BuiltScript, log: (s: string) => void = console.log): Promise<Rendered[]> => {
  const apiKey = envVar('ELEVENLABS_API_TOKEN');
  if (!apiKey) throw new Error('ELEVENLABS_API_TOKEN missing (root .env or environment)');
  mkdirSync(CACHE, { recursive: true });
  const files = script.lines.filter((l) => !l.slots);
  return mapLimit(files, Number(envVar('ELEVENLABS_CONCURRENCY') ?? 2) || 2, async (line) => {
    const path = await renderOne(apiKey, script.voice, line.text);
    const buf = readFileSync(path);
    log(`  ${line.key}.mp3  ${buf.length} B  (${line.text.slice(0, 40)}…)`);
    return { key: `${line.key}.mp3`, path, bytes: buf.length, sha256: sha256(buf) };
  });
};
