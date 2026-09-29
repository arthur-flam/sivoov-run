import type { AudioEvent } from '../schemas/audio';
import { ceremonySequence } from './audioTriggers';

/** The countdown line is read one number a second, from ten: the digits on screen follow its file. */
export const COUNTDOWN_SECONDS = 10;
/** A take this far from ten seconds shows digits out of step with the voice. */
export const COUNTDOWN_TOLERANCE_S = 0.3;

/**
 * What is wrong with the start ceremony as a whole, on the line concerned. They warn, they do
 * not block publishing: the run still starts, only the digits may not match the voice.
 * - `countdown_length`: the countdown line's sound is not ten seconds long (a voice take is
 *   whatever length it comes out; a file padded to ten seconds is the fix);
 * - `countdown_twice`: another countdown line follows this one, so this one shows no digits and
 *   plays like a line on the start line;
 * - `countdown_without_gun`: nothing after the countdown starts the clock on a sound.
 */
export type CeremonyIssue = { code: 'countdown_length'; seconds: number } | { code: 'countdown_twice' } | { code: 'countdown_without_gun' };

type Line = Pick<AudioEvent, 'id' | 'trigger'>;

/**
 * Pure: the ceremony's issues by line id (lines with none are absent). `secondsOf` is the
 * length of a line's sound when known (null: not recorded yet, or unreadable: not checked).
 */
export const ceremonyIssues = (lines: readonly Line[], secondsOf: (id: string) => number | null): Record<string, CeremonyIssue[]> => {
  const ceremony = ceremonySequence({ events: lines });
  if (!ceremony || ceremony.countdownIndex === null) return {};
  const noGun = ceremony.gunIndex >= ceremony.lines.length;
  const entries = ceremony.lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.trigger.at === 'countdown')
    .map(({ line, i }): [string, CeremonyIssue[]] => {
      const drives = i === ceremony.countdownIndex;
      const seconds = drives ? secondsOf(line.id) : null;
      const issues: (CeremonyIssue | null)[] = [
        drives ? null : { code: 'countdown_twice' },
        seconds !== null && Math.abs(seconds - COUNTDOWN_SECONDS) > COUNTDOWN_TOLERANCE_S ? { code: 'countdown_length', seconds: Math.round(seconds * 10) / 10 } : null,
        drives && noGun ? { code: 'countdown_without_gun' } : null,
      ];
      return [line.id, issues.filter((x): x is CeremonyIssue => x !== null)];
    });
  return Object.fromEntries(entries.filter(([, issues]) => issues.length > 0));
};
