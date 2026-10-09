import { audioSeconds, ceremonyIssues, voiceOfLine } from '@sivoov/shared';
import type { AudioScript, CeremonyIssue, ScriptLine, Voicing } from '@sivoov/shared';
import { renderKey, ttsHash } from './tts';
import { uploadKey } from './uploads';

/**
 * Where a line's sound waits before publishing, or one of its takes' (`voicing`, the line's own
 * words by default): the organizer's upload, or the render of its words by the line's voice, under
 * the key the studio's render stored it (`ttsHash` of that voice and those words).
 */
export const sourceKey = async (script: Pick<AudioScript, 'voice'>, line: ScriptLine, voicing: Pick<Voicing, 'text' | 'audio'> = line): Promise<string> => {
  if (voicing.audio) return uploadKey(voicing.audio);
  const voice = voiceOfLine(script, line);
  return renderKey(voice, await ttsHash(voice, voicing.text));
};

/** Enough of a file to read its length (a WAV header, an MP3's first frame past a modest ID3 tag). */
const HEAD_BYTES = 64 * 1024;

/** How long a stored sound lasts, from its first bytes; null when absent or unreadable. */
export const storedSeconds = async (files: R2Bucket, key: string): Promise<number | null> => {
  const object = await files.get(key, { range: { offset: 0, length: HEAD_BYTES } });
  if (!object) return null;
  return audioSeconds(new Uint8Array(await object.arrayBuffer()), object.size);
};

/**
 * The start ceremony's issues by line id (`ceremonyIssues`), with the countdown line's sound
 * measured from R2. Only countdown lines are read: the others' length does not matter.
 */
export const checkCeremony = async (files: R2Bucket, script: Pick<AudioScript, 'voice' | 'lines'>): Promise<Record<string, CeremonyIssue[]>> => {
  const countdowns = script.lines.filter((l) => l.trigger.kind === 'cue' && l.trigger.at === 'countdown' && (l.audio || l.text.trim().length > 0));
  const seconds = Object.fromEntries(await Promise.all(countdowns.map(async (l) => [l.id, await storedSeconds(files, await sourceKey(script, l))] as const)));
  return ceremonyIssues(script.lines, (id) => seconds[id] ?? null);
};
