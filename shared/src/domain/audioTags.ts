import type { ScriptVoice } from '../schemas/audioScript';

/**
 * ElevenLabs v3 reads stage directions in square brackets, « [excited] Partez ! », and turns
 * them into delivery instead of words. Older models would read them out loud, so a text keeps
 * its tags only for a model that understands them. Placeholders use braces, never brackets.
 */

/** The expressive model: audio tags, 70+ languages, French included. The default for new scripts. */
export const V3_MODEL = 'eleven_v3';

export const supportsAudioTags = (model: string): boolean => model.startsWith(V3_MODEL);

/** The tags offered in the studio, with the word a race director would use. Any other `[tag]` still works. */
export const AUDIO_TAGS: { tag: string; label: string }[] = [
  { tag: 'excited', label: 'Enthousiaste' },
  { tag: 'happy', label: 'Joyeux' },
  { tag: 'thoughtful', label: 'Posé' },
  { tag: 'whisper', label: 'Chuchoté' },
  { tag: 'surprised', label: 'Surpris' },
  { tag: 'curious', label: 'Complice' },
  { tag: 'laughs', label: 'Rire' },
  { tag: 'chuckles', label: 'Petit rire' },
  { tag: 'sighs', label: 'Soupir' },
  { tag: 'exhales', label: 'Grande inspiration' },
  { tag: 'applause', label: 'Applaudissements' },
];

const TAG = /\[[^\][{}]{1,40}\]/g;

/** The tags written in a text, without brackets, in order: `["excited", "laughs"]`. */
export const audioTagsIn = (text: string): string[] => Array.from(text.matchAll(TAG), (m) => m[0].slice(1, -1).trim());

/** The words alone: what a caption shows, what the browser voice reads, what an older model gets. */
export const stripAudioTags = (text: string): string =>
  text
    .replace(new RegExp(`${TAG.source}\\s*`, 'g'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** The text as this voice should receive it. */
export const textForVoice = (voice: Pick<ScriptVoice, 'model'>, text: string): string => (supportsAudioTags(voice.model) ? text.trim() : stripAudioTags(text));
