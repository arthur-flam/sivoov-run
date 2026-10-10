/**
 * Getting the pieces on disk, once: the sources (downloaded, or fetched from R2 for the music
 * we kept) and the voice's renders (Gemini through the AI Gateway, like the Worker), trimmed of
 * their leading and trailing silence so a cut places words to the tenth of a second.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { frenchNumber, geminiAudioOf, geminiTtsBody, geminiWav, plausibleSeconds, wavSeconds } from '@sivoov/shared';
import type { ScriptVoice } from '@sivoov/shared';
import { SOURCES } from './sources';
import type { SourceId } from './sources';

export const API_DIR = new URL('../../', import.meta.url).pathname;
export const CACHE = join(API_DIR, '.produce');
const SOURCES_DIR = join(CACHE, 'sources');
const VOICES_DIR = join(CACHE, 'voices');

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** A source on disk, downloaded the first time. */
export const source = async (id: SourceId): Promise<string> => {
  mkdirSync(SOURCES_DIR, { recursive: true });
  const s = SOURCES[id];
  const path = join(SOURCES_DIR, s.kind === 'r2' ? s.key.split('/').pop()! : `${id}.mp3`);
  if (!existsSync(path)) {
    if (s.kind === 'url') {
      const res = await fetch(s.url);
      if (!res.ok) throw new Error(`${id}: ${res.status} ${s.url}`);
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    } else {
      execFileSync('npx', ['wrangler', 'r2', 'object', 'get', `sivoov-run-files/${s.key}`, '--file', path, '--remote'], { cwd: API_DIR, stdio: 'inherit' });
    }
  }
  if (s.kind === 'r2' && !sha(readFileSync(path)).startsWith(s.sha256)) throw new Error(`${id}: not the file the recipe was cut to (${path})`);
  return path;
};

export type VoiceEnv = { geminiKey: string; gateway: string };

/** A variable from the environment, else from the repo's `.env`. */
export const envVar = (() => {
  const file = join(API_DIR, '../.env');
  const dotenv = Object.fromEntries(
    (existsSync(file) ? readFileSync(file, 'utf8') : '')
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1]!, m[2]!.replace(/^["']|["']$/g, '')]),
  );
  return (k: string): string => process.env[k] ?? dotenv[k] ?? '';
})();

/** Gemini through the AI Gateway, as the Worker calls it. */
export const voiceEnvFromDotenv = (): VoiceEnv => {
  const env = { geminiKey: envVar('GEMINI_API_KEY'), gateway: `https://gateway.ai.cloudflare.com/v1/${envVar('CLOUDFLARE_ACCOUNT_ID')}/sivoov` };
  if (!env.geminiKey || !envVar('CLOUDFLARE_ACCOUNT_ID')) throw new Error('GEMINI_API_KEY and CLOUDFLARE_ACCOUNT_ID are needed (the repo .env)');
  return env;
};

const norm = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1);

/**
 * What a take really says, heard by Gemini (a text model, through the gateway): the length
 * check misses a short scene read aloud before a long line. Null when it cannot be heard.
 */
const transcribe = async (env: VoiceEnv, wav: Buffer): Promise<string | null> => {
  const res = await fetch(`${env.gateway}/google-ai-studio/v1beta/models/gemini-3.8-flash:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.geminiKey, 'Content-Type': 'application/json', 'User-Agent': 'sivoov-produce/1' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
            { text: 'Transcris exactement ce que dit cette voix, en français, les nombres en toutes lettres. Rien d’autre que la transcription.' },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(' ') ?? null;
};

/**
 * A take says its words and not much else: at most a fifth of what is heard is not in the text.
 * Digits and "km" in the text count as said in words (the transcript writes « dix kilomètres »),
 * and a heard word matches a written one on its first five letters (« finisseur », « finisher »).
 */
export const saysItsWords = (text: string, heard: string): boolean => {
  const written = norm(text.replace(/\d+/g, (d) => frenchNumber(Number(d))).replace(/\bkm\b/g, 'kilomètres'));
  const expected = new Set(written);
  const stems = new Set(written.filter((w) => w.length >= 5).map((w) => w.slice(0, 5)));
  const words = norm(heard);
  const extra = words.filter((w) => !expected.has(w) && !(w.length >= 5 && stems.has(w.slice(0, 5)))).length;
  return words.length > 0 && extra / words.length <= 0.2;
};

/** Models whose daily quota ran out in this run: nothing more is asked of them. */
const spent = new Set<string>();

/** Gemini allows no more renders today (100 a day a model on our key): what is cached still plays. */
export class QuotaSpent extends Error {}

/** How long a per-minute 429 asks to wait, in seconds (`"retryDelay": "37s"`). */
const retryDelayS = (body: string): number | null => {
  const s = body.match(/"retryDelay":\s*"(\d+)/)?.[1];
  return s ? Number(s) : null;
};

/**
 * A take of `text` in the voice's own model, never the lighter one the Worker falls back on: what
 * this tool makes is heard by every runner, and the lite model reads its notes aloud on short
 * lines (six 27 s takes of « Kilomètre sept… », a 22 s « Trois ! »). A spent day waits for the next.
 */
export const voice = async (env: VoiceEnv, v: ScriptVoice, text: string, direction: string, scene?: string, take = 1): Promise<string> => {
  const key = sha(JSON.stringify([v.model, v.id, direction, scene ?? '', text, take])).slice(0, 32);
  mkdirSync(VOICES_DIR, { recursive: true });
  const trimmed = join(VOICES_DIR, `${key}.wav`);
  const checked = join(VOICES_DIR, `${key}.heard.txt`);
  // A take already refused (too long, or saying something else) is not paid for twice.
  const refused = join(VOICES_DIR, `${key}.refused`);
  if (existsSync(refused) && take < 6) return voice(env, v, text, direction, scene, take + 1);
  if (existsSync(trimmed)) {
    if (existsSync(checked)) return trimmed;
    // A take kept before takes were heard: hear it now.
    const heard = await transcribe(env, readFileSync(trimmed));
    if (heard === null || saysItsWords(text, heard)) {
      writeFileSync(checked, heard ?? '');
      return trimmed;
    }
    console.log(`  voice: kept take ${take} of "${text.slice(0, 40)}" says "${heard.slice(0, 80)}", again`);
    return voice(env, v, text, direction, scene, take + 1);
  }
  const spentToday = () => new QuotaSpent(`voice: ${v.model}'s quota for today is spent ("${text}")`);
  if (spent.has(v.model)) throw spentToday();
  const call = () =>
    fetch(`${env.gateway}/google-ai-studio/v1beta/models/${v.model}:generateContent`, {
      method: 'POST',
      // The gateway caches identical requests: a second take must not get the first one back.
      headers: { 'x-goog-api-key': env.geminiKey, 'Content-Type': 'application/json', 'User-Agent': 'sivoov-produce/1', 'cf-aig-skip-cache': 'true' },
      body: JSON.stringify(geminiTtsBody({ id: v.id, direction }, text, scene)),
    });
  const perDay = async (r: Response) => r.status === 429 && (await r.clone().text()).includes('PerDay');
  // The TTS models allow our key ten requests a minute: wait as long as the 429 says, plus a few
  // random seconds so that the renders running side by side do not all ask again at once (a
  // refused request seems to count against the minute too, and in step they never got through).
  let res = await call();
  for (let attempt = 1; res.status === 429 && !(await perDay(res)) && attempt <= 10; attempt += 1) {
    const wait = (retryDelayS(await res.clone().text()) ?? 15 * attempt) + Math.round(Math.random() * 20);
    console.log(`  voice: rate limited, waiting ${wait} s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await call();
  }
  if (await perDay(res)) {
    spent.add(v.model);
    throw spentToday();
  }
  if (!res.ok) throw new Error(`voice ${res.status}: ${(await res.text()).slice(0, 200)} (${text})`);
  const audio = geminiAudioOf(await res.json());
  if (!audio) throw new Error(`voice: no audio for "${text}"`);
  const wav = geminiWav(Buffer.from(audio, 'base64'));
  const seconds = wavSeconds(wav) ?? 0;
  // The model read its notes aloud: ask for another take (another cache key).
  if (!plausibleSeconds(text, seconds)) {
    if (take >= 6) throw new Error(`voice: every take of "${text}" is too long (${seconds.toFixed(1)} s)`);
    console.log(`  voice: take ${take} of "${text.slice(0, 40)}" lasts ${seconds.toFixed(1)} s, again`);
    writeFileSync(refused, `${seconds.toFixed(1)} s`);
    return voice(env, v, text, direction, scene, take + 1);
  }
  const heard = await transcribe(env, Buffer.from(wav));
  if (heard !== null && !saysItsWords(text, heard)) {
    if (take >= 6) throw new Error(`voice: every take of "${text}" says something else ("${heard}")`);
    console.log(`  voice: take ${take} of "${text.slice(0, 40)}" says "${heard.slice(0, 80)}", again`);
    writeFileSync(refused, heard);
    return voice(env, v, text, direction, scene, take + 1);
  }
  const raw = join(VOICES_DIR, `${key}.raw.wav`);
  writeFileSync(raw, wav);
  writeFileSync(checked, heard ?? '');
  // Where this take came from, beside it: the model, the voice, the words, and when.
  writeFileSync(join(VOICES_DIR, `${key}.json`), JSON.stringify({ provider: 'gemini', model: v.model, voice: v.id, direction, scene: scene ?? null, text, take, at: new Date().toISOString() }));
  const edge = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05';
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', `${edge},areverse,${edge},areverse`, trimmed]);
  return trimmed;
};

/**
 * Where a voice take came from (written when it was rendered), or null: a take kept from before
 * origins were written, or not a voice take at all (a mix also holds sounds and music).
 */
export const voiceOrigin = (path: string): Record<string, unknown> | null => {
  const file = path.replace(/\.wav$/, '.json');
  return path.startsWith(VOICES_DIR) && file !== path && existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : null;
};
