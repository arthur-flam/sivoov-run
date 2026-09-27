import type { AudioUploadFormat, ScriptVoice } from '../schemas/audioScript';
import { stripAudioTags } from './audioTags';

/**
 * Google's Gemini voices (the Gemini API's text-to-speech models), beside ElevenLabs'. Native
 * French voices, directed in words rather than tags: the voice's `direction` ("le speaker de la
 * course, enthousiaste, sur la sono") goes in a director's-notes block and only the transcript
 * is read. The API answers raw 16-bit PCM at 24 kHz, mono; the Worker cannot encode MP3, so a
 * Gemini render is stored as WAV (and the pack file of such a line is `.wav`).
 */

/** The model used for new Gemini voices: the best French delivery measured on 2026-09-27. */
export const GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts';

export const isGeminiVoice = (voice: Pick<ScriptVoice, 'model'>): boolean => voice.model.startsWith('gemini-');

/** The file a voice's render is: WAV for Gemini (raw PCM wrapped), MP3 for ElevenLabs. */
export const voiceFormat = (voice: Pick<ScriptVoice, 'model'>): AudioUploadFormat => (isGeminiVoice(voice) ? 'wav' : 'mp3');

/** What the house voice is asked to be when a script says nothing: the race's own speaker. */
export const DEFAULT_DIRECTION = 'Le speaker officiel de la course, dans les écouteurs du coureur. Chaleureux, enthousiaste, précis, jamais criard. Français de France.';

/** Where the speaker is, when a line does not say: in the runner's ears. */
export const DEFAULT_SCENE = 'Dans les écouteurs d’un coureur, pendant sa course.';

/**
 * The prompt: an audio profile, a scene and director's notes the model plays and does not
 * read, then the words. Measured on gemini-3.8-flash-tts (2026-09-27): a bare "Say…:" prefix
 * was read out every time, notes with a transcript heading about one time in three, this full
 * form never in our tries. `plausibleSeconds` catches the rest.
 */
export const geminiPrompt = (direction: string, text: string, scene: string = DEFAULT_SCENE): string =>
  [
    '# AUDIO PROFILE: le speaker de la course',
    `## THE SCENE: ${scene.trim()}`,
    "### DIRECTOR'S NOTES",
    direction.trim(),
    '#### TRANSCRIPT',
    stripAudioTags(text),
  ].join('\n');

/** The generateContent body for one line. */
export const geminiTtsBody = (voice: Pick<ScriptVoice, 'id' | 'direction'>, text: string, scene?: string): Record<string, unknown> => ({
  contents: [{ parts: [{ text: geminiPrompt(voice.direction ?? DEFAULT_DIRECTION, text, scene) }] }],
  generationConfig: {
    responseModalities: ['AUDIO'],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice.id } } },
  },
});

export const GEMINI_PCM_RATE = 24_000;

/** Raw little-endian 16-bit mono PCM into a WAV file both phones play. */
export const pcmToWav = (pcm: Uint8Array, sampleRate: number = GEMINI_PCM_RATE): Uint8Array => {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + pcm.byteLength, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, pcm.byteLength, true);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
};

/** The answer's audio as a WAV file: the model sends raw PCM, or sometimes a WAV already (`audio/wav`). */
export const geminiWav = (bytes: Uint8Array): Uint8Array =>
  bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE' ? bytes : pcmToWav(bytes);

/** The base64 audio of a generateContent answer, or null when the model sent none (a refusal, an empty answer). */
export const geminiAudioOf = (answer: unknown): string | null => {
  const parts = (answer as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.inlineData?.data).find((d): d is string => typeof d === 'string' && d.length > 0) ?? null;
};

/** A WAV file's length in seconds, from its header; null when it is not one. */
export const wavSeconds = (wav: Uint8Array): number | null => {
  if (wav.length < 44 || String.fromCharCode(...wav.slice(0, 4)) !== 'RIFF') return null;
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const byteRate = v.getUint32(28, true);
  return byteRate > 0 ? (wav.length - 44) / byteRate : null;
};

/**
 * Whether a take is about as long as its words: French is said at 12 to 16 characters a
 * second, pauses included; a take several times longer has the director's notes read into it.
 */
export const plausibleSeconds = (text: string, seconds: number): boolean => seconds <= 1.5 + stripAudioTags(text).length * 0.13;
