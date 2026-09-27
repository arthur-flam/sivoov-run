import { ceremonySequence } from '@sivoov/shared';
import type { AudioEvent, AudioPack, CueMoment } from '@sivoov/shared';
import { playSequence } from './player';
import { ambiance as sharedAmbiance } from './under';
import type { Ambiance } from './under';

/** The start ceremony ready to play: every line with a playable file (and its ambiance, if any), and which one is the gun. */
export type CeremonyPlan = { lines: { at: CueMoment; uri: string; under?: string }[]; gunIndex: number };

/**
 * The pack's start ceremony, or null when the run keeps the silent visual countdown: the pack
 * has no cue, or one of its lines has no sound. Never half a ceremony. `soundFor` picks each
 * line's sound: the runner's own version of a personal line ("Dossard 1247, Camille Martin")
 * when it came down with the pack, the pack's offline file otherwise.
 */
export const ceremonyPlan = (
  pack: Pick<AudioPack, 'events'> | null,
  soundFor: (event: AudioEvent) => string | null,
  uriFor: (key: string) => string | null = () => null,
): CeremonyPlan | null => {
  const ceremony = pack ? ceremonySequence(pack) : null;
  if (!ceremony) return null;
  const lines = ceremony.lines.map((line) => {
    const under = line.under ? uriFor(line.under) : null;
    return { at: line.trigger.at, uri: soundFor(line), ...(under ? { under } : {}) };
  });
  return lines.every((l): l is CeremonyPlan['lines'][number] => l.uri !== null) ? { lines, gunIndex: ceremony.gunIndex } : null;
};

/** What the screen shows before the gun: the calm "on the line" state, or the digits of the countdown file. */
export type CeremonyCue = { at: 'armed' } | { at: 'countdown'; seconds: number };

export type Ceremony = {
  /**
   * When the clock starts: the source time at which the gun line started playing (or the last
   * line ended, for a ceremony with no gun), or null when a line before the gun failed and the
   * run must fall back to the visual countdown. Also null once stopped.
   */
  gun: Promise<number | null>;
  stop: () => void;
};

/**
 * Plays the ceremony back to back. Everything is synchronised on file boundaries: the digits
 * are the countdown file's own remaining seconds, and the gun is the gun file's first second.
 * Lines after the gun (a roar) keep playing once the clock runs; `stop` silences them. A line's
 * ambiance (the crowd of the start area, the music after the gun) starts with the line and
 * carries on under the next ones, into the run.
 */
export const playCeremony = (plan: CeremonyPlan, now: () => number, onCue: (cue: CeremonyCue) => void, ambiance: Ambiance = sharedAmbiance): Ceremony => {
  let settle: (at: number | null) => void = () => undefined;
  let fired = false;
  let ticket: number | undefined;
  const gun = new Promise<number | null>((resolve) => {
    settle = resolve;
  });
  const beforeGun = (index: number) => (index < plan.gunIndex ? plan.lines[index]?.at : undefined);
  const sequence = playSequence(
    plan.lines.map((l) => l.uri),
    {
      onStart: (index, remaining, elapsed) => {
        const under = plan.lines[index]?.under;
        if (under) ticket = ambiance.start(under);
        const at = beforeGun(index);
        if (at === 'countdown') return onCue({ at, seconds: Math.ceil(remaining) });
        if (at === 'armed') return onCue({ at });
        // The status that says so lags the sound by up to one update: date the gun from the file.
        fired = true;
        settle(now() - elapsed * 1000);
      },
      onRemaining: (index, remaining) => {
        if (beforeGun(index) === 'countdown') onCue({ at: 'countdown', seconds: Math.ceil(remaining) });
      },
      onDone: () => settle(now()),
      onFail: (index) => settle(index >= plan.gunIndex ? now() : null),
    },
  );
  return {
    gun,
    stop: () => {
      sequence.stop();
      // Before the gun the ambiance is the ceremony's; after it, the run's (it fades on its own).
      if (!fired) ambiance.stop(ticket);
      settle(null);
    },
  };
};
