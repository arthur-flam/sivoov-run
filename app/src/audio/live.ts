import { liveFactsFor, takeOf } from '@sivoov/shared';
import type { AudioEvent, AudioPack, LiveVoice, RunState } from '@sivoov/shared';
import { ApiError, LIVE_VOICE_TIMEOUT_MS, api } from '@/api';
import { afterAttempt, allows, closedBreaker } from './breaker';
import type { Breaker } from './breaker';
import { liveFile } from './packDisk';

/** The live lines' breaker for this run (breaker.ts): a valley with no signal must not make every split late. */
let breaker: Breaker = closedBreaker;

/** A new run starts with the live lines asked for again. */
export const resetLiveLines = (): void => {
  breaker = closedBreaker;
};

/** A failure that says the network is not there (no answer, a server down), not a refusal from a server that answered. */
const networkFailure = (e: unknown): boolean => !(e instanceof ApiError) || e.status >= 500;

/**
 * A live personal line ("Kilomètre vingt et un, une heure cinquante-deux") said with the run's
 * numbers at the moment it fires, with the words it says for the caption, when the Worker
 * answers and its file is on the phone within LIVE_VOICE_TIMEOUT_MS (`url` is then that local
 * file; on the web, the remote one). Null otherwise, and the line's offline file plays instead.
 * `take`: the take the engine chose, asked for by its id; its own personal version must be live.
 * After two network failures in a row, live lines are not asked for during five minutes.
 */
export const liveSound = async (pack: Pick<AudioPack, 'courseId' | 'version'>, event: AudioEvent, state: RunState, token: string | null, take?: string): Promise<LiveVoice | null> => {
  if (!token || takeOf(event, take)?.personal?.phase !== 'live') return null;
  const started = Date.now();
  if (!allows(breaker, started)) return null;
  try {
    const voice = await api.liveVoice(token, { courseId: pack.courseId, version: pack.version, eventId: event.id, ...(take ? { take } : {}), facts: liveFactsFor(state) });
    const url = await liveFile(voice.url, LIVE_VOICE_TIMEOUT_MS - (Date.now() - started));
    breaker = afterAttempt(breaker, true, Date.now());
    return { ...voice, url };
  } catch (e) {
    if (networkFailure(e)) breaker = afterAttempt(breaker, false, Date.now());
    return null;
  }
};
