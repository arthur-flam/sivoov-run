import type { AudioEvent, VoiceLevel } from '../schemas/audio';

/** The levels from the most voice to the least, as the run screen offers them. */
export const VOICE_LEVELS: readonly VoiceLevel[] = ['all', 'course', 'essential'];

/** Lines no level silences: the ceremony, the start, the finish, and anything about safety. */
const alwaysHeard = (event: Pick<AudioEvent, 'category' | 'trigger'>): boolean =>
  event.category === 'ceremony' || event.category === 'safety' || ['cue', 'start', 'finish'].includes(event.trigger.kind);

/** The places along the course and the kilometre calls, whatever category the organizer gave a split. */
const courseLine = (event: Pick<AudioEvent, 'category' | 'trigger'>): boolean => event.category === 'course' || event.trigger.kind === 'split';

/**
 * Whether a line plays at the runner's voice level (« moins de voix »). A silenced line still
 * fires, is logged to the trace and shows in the run screen's list: only its sound is skipped.
 */
export const audibleAt = (level: VoiceLevel, event: Pick<AudioEvent, 'category' | 'trigger'>): boolean =>
  alwaysHeard(event) || level === 'all' || (level === 'course' && courseLine(event));
