import { ttsRequestBody, voiceCacheInput } from '@sivoov/shared';
import type { ScriptVoice } from '@sivoov/shared';
import { sha256Hex, sha256HexBytes } from './crypto';

/**
 * ElevenLabs in the Worker. Every render is cached in R2 under the sha256 of what the voice
 * was asked to read (`voiceCacheInput`: the text as that model takes it, the voice, the model,
 * the stability), the same rule as the CLI (api/tools/audio/tts.ts), so a sentence is never
 * paid for twice. Two places:
 * - `tts/`: the studio's renders, private to the organizer (the draft's lines, samples);
 * - `voices/`: what runners hear said to them (their personal lines), public by hash.
 * `fetchImpl` is injected so the workerd tests can stub the provider.
 */
export const TTS_PREFIX = 'tts/';
export const VOICES_PREFIX = 'voices/';
export type RenderPrefix = typeof TTS_PREFIX | typeof VOICES_PREFIX;

export const ttsKey = (hash: string, prefix: RenderPrefix = TTS_PREFIX): string => `${prefix}${hash}.mp3`;

export const ttsHash = (voice: ScriptVoice, text: string): Promise<string> => sha256Hex(voiceCacheInput(voice, text));

export type TtsDeps = { files: R2Bucket; apiKey: string; fetchImpl?: typeof fetch };
/** `sha256` is the file's own, for the app's download check. */
export type TtsRendered = { hash: string; key: string; bytes: number; sha256: string; cached: boolean };
export type TtsOutcome = { ok: true; rendered: TtsRendered } | { ok: false; status: number; detail: string };

const ELEVENLABS = 'https://api.elevenlabs.io/v1/text-to-speech';

/** The rendered MP3 for a text, from the R2 cache when it is there. */
export const renderText = async (
  deps: TtsDeps,
  voice: ScriptVoice,
  text: string,
  opts: { prefix?: RenderPrefix; locale?: 'fr' | 'en' } = {},
): Promise<TtsOutcome> => {
  const hash = await ttsHash(voice, text);
  const key = ttsKey(hash, opts.prefix);
  const head = await deps.files.head(key);
  if (head) {
    const known = head.customMetadata?.sha256;
    const sha256 = known ?? (await sha256HexBytes(await (await deps.files.get(key))!.arrayBuffer()));
    return { ok: true, rendered: { hash, key, bytes: head.size, sha256, cached: true } };
  }
  const call = deps.fetchImpl ?? fetch;
  const res = await call(`${ELEVENLABS}/${voice.id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': deps.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(ttsRequestBody(voice, text, opts.locale)),
  });
  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text().catch(() => '')).slice(0, 200) };
  const body = await res.arrayBuffer();
  if (body.byteLength === 0) return { ok: false, status: 502, detail: 'empty audio' };
  const sha256 = await sha256HexBytes(body);
  await deps.files.put(key, body, { httpMetadata: { contentType: 'audio/mpeg' }, customMetadata: { sha256 } });
  return { ok: true, rendered: { hash, key, bytes: body.byteLength, sha256, cached: false } };
};

/** A studio line: private cache. */
export const renderLine = (deps: TtsDeps, voice: ScriptVoice, text: string, locale: 'fr' | 'en' = 'fr'): Promise<TtsOutcome> => renderText(deps, voice, text, { locale });
