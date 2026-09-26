import { V3_MODEL, supportsAudioTags } from '@sivoov/shared';
import type { ScriptVoice } from '@sivoov/shared';

/**
 * The voices a race director can pick in the studio. ElevenLabs' own voices below were checked
 * against our key with eleven_v3 in French on 2026-09-26 (some older ones answer 402 or 404
 * and are left out). They are English voices speaking French, with a light accent: a native
 * French voice comes from ElevenLabs' Voice Library, added to the account, then pasted here by
 * its id. When the key may read the account (`voices_read`), its own voices are listed too.
 */
export type VoiceChoice = { id: string; name: string; note: string };

export const HOUSE_VOICES: VoiceChoice[] = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', note: 'Homme, chaleureux, conteur' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', note: 'Homme, posé, voix de présentateur' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', note: 'Homme, grave, profond' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', note: 'Homme, jeune, énergique' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', note: 'Homme, ferme' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', note: 'Homme, détendu' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', note: 'Femme, claire, assurée' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', note: 'Femme, enjouée' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', note: 'Femme, vive, chaleureuse' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', note: 'Femme, veloutée' },
];

export const MODEL_CHOICES = [
  { id: V3_MODEL, label: 'Expressive (Eleven v3)', note: 'Joue les indications entre crochets : [excited], [whisper]… Recommandée.' },
  { id: 'eleven_multilingual_v2', label: 'Régulière (Multilingual v2)', note: 'Plus égale d’une annonce à l’autre, sans indications de jeu.' },
] as const;

/** v3's three settings, in ElevenLabs' words translated: creative, natural, robust. */
export const STABILITY_CHOICES = [
  { value: 0, label: 'Créative', note: 'Plus d’émotion, parfois des surprises.' },
  { value: 0.5, label: 'Naturelle', note: 'Au plus près de la voix d’origine.' },
  { value: 1, label: 'Régulière', note: 'Très stable, suit moins les indications.' },
] as const;

/** The voice of the house (a recorded decision, AUDIO.md): every new script starts with it. */
export const DEFAULT_VOICE: ScriptVoice = { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', model: V3_MODEL };

/** "George · Expressive (Eleven v3) · Naturelle": the voice in one line, for the studio header. */
export const voiceSummary = (voice: ScriptVoice): string =>
  [
    voice.name || voice.id,
    MODEL_CHOICES.find((m) => m.id === voice.model)?.label ?? voice.model,
    supportsAudioTags(voice.model) ? (STABILITY_CHOICES.find((s) => s.value === (voice.stability ?? 0.5))?.label ?? null) : null,
  ]
    .filter((p): p is string => p !== null)
    .join(' · ');

/** What the organizer hears when auditioning a voice: the race's own name, with a tag or two. */
export const voiceSample = (raceName: string, voice: Pick<ScriptVoice, 'model'>): string =>
  supportsAudioTags(voice.model)
    ? `[excited] Bienvenue au ${raceName} ! [thoughtful] Où que vous soyez ce matin, vous courez avec nous. Coureurs… à vos marques.`
    : `Bienvenue au ${raceName} ! Où que vous soyez ce matin, vous courez avec nous. Coureurs, à vos marques.`;

export type AccountVoices = { voices: VoiceChoice[] } | { voices: null; reason: 'no_key' | 'no_permission' | 'error' };

/** The account's own voices (the Voice Library ones added to it included), when the key may read them. */
export const accountVoices = async (apiKey: string | undefined, fetchImpl: typeof fetch = fetch): Promise<AccountVoices> => {
  if (!apiKey) return { voices: null, reason: 'no_key' };
  try {
    const res = await fetchImpl('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(4000) });
    if (res.status === 401 || res.status === 403) return { voices: null, reason: 'no_permission' };
    if (!res.ok) return { voices: null, reason: 'error' };
    const body = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string> }[] };
    const voices = (body.voices ?? [])
      .filter((v) => !HOUSE_VOICES.some((h) => h.id === v.voice_id))
      .map((v) => ({ id: v.voice_id, name: v.name, note: [v.labels?.language, v.labels?.accent, v.labels?.gender, v.category].filter(Boolean).join(', ') }));
    return { voices };
  } catch {
    return { voices: null, reason: 'error' };
  }
};
