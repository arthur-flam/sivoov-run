import { ttsCacheInput } from '@sivoov/shared';
import type { ScriptVoice } from '@sivoov/shared';
import { sha256Hex } from './crypto';

/**
 * ElevenLabs in the Worker: the studio renders one line at a time and caches the MP3 in R2
 * at `tts/<sha256(text|voiceId|model)>.mp3` — the same hash rule as the CLI
 * (api/tools/audio/tts.ts), so a line whose text has not changed is never paid for twice.
 * `fetchImpl` is injected so the workerd tests can stub the provider.
 */
export const TTS_PREFIX = 'tts/';
export const ttsKey = (hash: string): string => `${TTS_PREFIX}${hash}.mp3`;

export const ttsHash = (voice: ScriptVoice, text: string): Promise<string> => sha256Hex(ttsCacheInput(text, voice.id, voice.model));

export type TtsDeps = { files: R2Bucket; apiKey: string; fetchImpl?: typeof fetch };
export type TtsRendered = { hash: string; key: string; bytes: number; cached: boolean };
export type TtsOutcome = { ok: true; rendered: TtsRendered } | { ok: false; status: number; detail: string };

const ELEVENLABS = 'https://api.elevenlabs.io/v1/text-to-speech';

/** The rendered MP3 for a line, from the R2 cache when it is there. */
export const renderLine = async (deps: TtsDeps, voice: ScriptVoice, text: string): Promise<TtsOutcome> => {
  const hash = await ttsHash(voice, text);
  const key = ttsKey(hash);
  const head = await deps.files.head(key);
  if (head) return { ok: true, rendered: { hash, key, bytes: head.size, cached: true } };
  const call = deps.fetchImpl ?? fetch;
  const res = await call(`${ELEVENLABS}/${voice.id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': deps.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: voice.model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 } }),
  });
  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text().catch(() => '')).slice(0, 200) };
  const body = await res.arrayBuffer();
  if (body.byteLength === 0) return { ok: false, status: 502, detail: 'empty audio' };
  await deps.files.put(key, body, { httpMetadata: { contentType: 'audio/mpeg' } });
  return { ok: true, rendered: { hash, key, bytes: body.byteLength, cached: false } };
};
