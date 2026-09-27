/**
 * Getting the pieces on disk, once: the sources (downloaded, or fetched from R2 for the music
 * we kept) and the voice's renders (Gemini through the AI Gateway, like the Worker), trimmed of
 * their leading and trailing silence so a cut places words to the tenth of a second.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { geminiAudioOf, geminiTtsBody, geminiWav, plausibleSeconds, wavSeconds } from '@sivoov/shared';
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

/**
 * The voice reading `text` with `direction`, as a trimmed WAV. Cached by what was asked, so a
 * line is paid for once; `take` asks for another reading of the same words.
 */
export const voice = async (env: VoiceEnv, v: ScriptVoice, text: string, direction: string, scene?: string, take = 1): Promise<string> => {
  mkdirSync(VOICES_DIR, { recursive: true });
  const key = sha(JSON.stringify([v.model, v.id, direction, scene ?? '', text, take])).slice(0, 32);
  const trimmed = join(VOICES_DIR, `${key}.wav`);
  if (existsSync(trimmed)) return trimmed;
  const call = () =>
    fetch(`${env.gateway}/google-ai-studio/v1beta/models/${v.model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.geminiKey, 'Content-Type': 'application/json', 'User-Agent': 'sivoov-produce/1' },
      body: JSON.stringify(geminiTtsBody({ id: v.id, direction }, text, scene)),
    });
  // The preview TTS models allow a few requests a minute: wait and try again on 429.
  let res = await call();
  for (let attempt = 1; res.status === 429 && attempt <= 10; attempt += 1) {
    console.log(`  voice: rate limited, waiting ${15 * attempt} s`);
    await new Promise((r) => setTimeout(r, 15_000 * attempt));
    res = await call();
  }
  if (!res.ok) throw new Error(`voice ${res.status}: ${(await res.text()).slice(0, 200)} (${text})`);
  const audio = geminiAudioOf(await res.json());
  if (!audio) throw new Error(`voice: no audio for "${text}"`);
  const wav = geminiWav(Buffer.from(audio, 'base64'));
  const seconds = wavSeconds(wav) ?? 0;
  // The model read its notes aloud: ask for another take (another cache key).
  if (!plausibleSeconds(text, seconds)) {
    if (take >= 4) throw new Error(`voice: every take of "${text}" is too long (${seconds.toFixed(1)} s)`);
    console.log(`  voice: take ${take} of "${text.slice(0, 40)}" lasts ${seconds.toFixed(1)} s, again`);
    return voice(env, v, text, direction, scene, take + 1);
  }
  const raw = join(VOICES_DIR, `${key}.raw.wav`);
  writeFileSync(raw, wav);
  const edge = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05';
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', `${edge},areverse,${edge},areverse`, trimmed]);
  return trimmed;
};
