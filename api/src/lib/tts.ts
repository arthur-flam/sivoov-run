import { AUDIO_CONTENT_TYPES, geminiAudioOf, geminiTtsBody, isGeminiVoice, pcmToWav, ttsRequestBody, voiceCacheInput, voiceFormat } from '@sivoov/shared';
import type { AudioUploadFormat, ScriptVoice } from '@sivoov/shared';
import { sha256Hex, sha256HexBytes } from './crypto';

/**
 * The voice in the Worker: ElevenLabs, or Google's Gemini voices (native French, directed in
 * words), picked by the script's voice model. Every render is cached in R2 under the sha256 of
 * what the voice was asked to read (`voiceCacheInput`: the text as that model takes it, the
 * voice, the model, its settings), the same rule as the CLI (api/tools/audio/tts.ts), so a
 * sentence is never paid for twice. Two places:
 * - `tts/`: the studio's renders, private to the organizer (the draft's lines, samples);
 * - `voices/`: what runners hear said to them (their personal lines), public by hash.
 * ElevenLabs renders are MP3; Gemini answers raw PCM, stored as WAV. Gemini is reached through
 * the AI Gateway (`AI_GATEWAY`), like every model call. `fetchImpl` lets the tests stub both.
 */
export const TTS_PREFIX = 'tts/';
export const VOICES_PREFIX = 'voices/';
export type RenderPrefix = typeof TTS_PREFIX | typeof VOICES_PREFIX;

export const ttsKey = (hash: string, prefix: RenderPrefix = TTS_PREFIX, format: AudioUploadFormat = 'mp3'): string => `${prefix}${hash}.${format}`;

/** Where a voice's render of `hash` is kept. */
export const renderKey = (voice: Pick<ScriptVoice, 'model'>, hash: string, prefix: RenderPrefix = TTS_PREFIX): string => ttsKey(hash, prefix, voiceFormat(voice));

export const ttsHash = (voice: ScriptVoice, text: string): Promise<string> => sha256Hex(voiceCacheInput(voice, text));

export type TtsDeps = {
  files: R2Bucket;
  /** ElevenLabs key, for ElevenLabs voices. */
  elevenlabs?: string;
  /** Gemini API key and the gateway base (`https://gateway.ai.cloudflare.com/v1/<account>/<gateway>`), for Gemini voices. */
  gemini?: { apiKey: string; gateway: string };
  fetchImpl?: typeof fetch;
};

type VoiceEnv = { FILES: R2Bucket; ELEVENLABS_API_TOKEN?: string; GEMINI_API_KEY?: string; CF_ACCOUNT_ID?: string; AI_GATEWAY?: string };

/** The providers this environment can reach. A blank secret means none (see MEMORY.md, '' in tests). */
export const ttsDepsFor = (env: VoiceEnv): TtsDeps => ({
  files: env.FILES,
  ...(env.ELEVENLABS_API_TOKEN ? { elevenlabs: env.ELEVENLABS_API_TOKEN } : {}),
  ...(env.GEMINI_API_KEY && env.CF_ACCOUNT_ID && env.AI_GATEWAY
    ? { gemini: { apiKey: env.GEMINI_API_KEY, gateway: `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY}` } }
    : {}),
});

/** Whether this voice can be rendered here at all. */
export const canRender = (deps: Pick<TtsDeps, 'elevenlabs' | 'gemini'>, voice: Pick<ScriptVoice, 'model'>): boolean =>
  isGeminiVoice(voice) ? Boolean(deps.gemini) : Boolean(deps.elevenlabs);

/** `sha256` is the file's own, for the app's download check. */
export type TtsRendered = { hash: string; key: string; bytes: number; sha256: string; cached: boolean; format: AudioUploadFormat };
export type TtsOutcome = { ok: true; rendered: TtsRendered } | { ok: false; status: number; detail: string };

const ELEVENLABS = 'https://api.elevenlabs.io/v1/text-to-speech';

type Fetched = { ok: true; body: Uint8Array } | { ok: false; status: number; detail: string };

const fromElevenLabs = async (deps: TtsDeps, voice: ScriptVoice, text: string, locale: 'fr' | 'en' | undefined): Promise<Fetched> => {
  if (!deps.elevenlabs) return { ok: false, status: 503, detail: 'no ElevenLabs key' };
  const res = await (deps.fetchImpl ?? fetch)(`${ELEVENLABS}/${voice.id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': deps.elevenlabs, 'Content-Type': 'application/json' },
    body: JSON.stringify(ttsRequestBody(voice, text, locale)),
  });
  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text().catch(() => '')).slice(0, 200) };
  return { ok: true, body: new Uint8Array(await res.arrayBuffer()) };
};

const fromGemini = async (deps: TtsDeps, voice: ScriptVoice, text: string): Promise<Fetched> => {
  if (!deps.gemini) return { ok: false, status: 503, detail: 'no Gemini key' };
  const res = await (deps.fetchImpl ?? fetch)(`${deps.gemini.gateway}/google-ai-studio/v1beta/models/${voice.model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': deps.gemini.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiTtsBody(voice, text)),
  });
  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text().catch(() => '')).slice(0, 200) };
  const audio = geminiAudioOf(await res.json().catch(() => null));
  if (!audio) return { ok: false, status: 502, detail: 'no audio in the answer' };
  return { ok: true, body: pcmToWav(Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))) };
};

/** The rendered file for a text, from the R2 cache when it is there. */
export const renderText = async (
  deps: TtsDeps,
  voice: ScriptVoice,
  text: string,
  opts: { prefix?: RenderPrefix; locale?: 'fr' | 'en' } = {},
): Promise<TtsOutcome> => {
  const format = voiceFormat(voice);
  const hash = await ttsHash(voice, text);
  const key = ttsKey(hash, opts.prefix, format);
  const head = await deps.files.head(key);
  if (head) {
    const known = head.customMetadata?.sha256;
    const sha256 = known ?? (await sha256HexBytes(await (await deps.files.get(key))!.arrayBuffer()));
    return { ok: true, rendered: { hash, key, bytes: head.size, sha256, cached: true, format } };
  }
  const fetched = isGeminiVoice(voice) ? await fromGemini(deps, voice, text) : await fromElevenLabs(deps, voice, text, opts.locale);
  if (!fetched.ok) return fetched;
  if (fetched.body.byteLength === 0) return { ok: false, status: 502, detail: 'empty audio' };
  const body = fetched.body.buffer.slice(fetched.body.byteOffset, fetched.body.byteOffset + fetched.body.byteLength) as ArrayBuffer;
  const sha256 = await sha256HexBytes(body);
  await deps.files.put(key, body, { httpMetadata: { contentType: AUDIO_CONTENT_TYPES[format] }, customMetadata: { sha256 } });
  return { ok: true, rendered: { hash, key, bytes: body.byteLength, sha256, cached: false, format } };
};

/** A studio line: private cache. */
export const renderLine = (deps: TtsDeps, voice: ScriptVoice, text: string, locale: 'fr' | 'en' = 'fr'): Promise<TtsOutcome> => renderText(deps, voice, text, { locale });
