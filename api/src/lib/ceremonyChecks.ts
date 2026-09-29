import { audioSeconds, ceremonyIssues } from '@sivoov/shared';
import type { AudioScript, CeremonyIssue, ScriptLine } from '@sivoov/shared';
import { renderKey, ttsHash } from './tts';
import { uploadKey } from './uploads';

/** Where a line's sound waits before publishing: the organizer's upload, or the voice cache for its text. */
export const sourceKey = async (script: Pick<AudioScript, 'voice'>, line: ScriptLine): Promise<string> =>
  line.audio ? uploadKey(line.audio) : renderKey(script.voice, await ttsHash(script.voice, line.text));

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
