import { liveFactsFor } from '@sivoov/shared';
import type { AudioEvent, AudioPack, LiveVoice, RunState } from '@sivoov/shared';
import { api } from '@/api';

/**
 * A live personal line ("Kilomètre vingt et un, une heure cinquante-deux") said with the run's
 * numbers at the moment it fires, when the phone has a network and the Worker answers within
 * LIVE_VOICE_TIMEOUT_MS, with the words it says for the caption; null otherwise, and the
 * line's offline file plays instead.
 */
export const liveSound = async (pack: Pick<AudioPack, 'courseId' | 'version'>, event: AudioEvent, state: RunState, token: string | null): Promise<LiveVoice | null> => {
  if (!token || event.personal?.phase !== 'live') return null;
  return api.liveVoice(token, { courseId: pack.courseId, version: pack.version, eventId: event.id, facts: liveFactsFor(state) }).catch(() => null);
};
