import { ceremonySequence } from '@sivoov/shared';
import type { AudioPack, CueMoment } from '@sivoov/shared';
import { playSequence } from './player';

/** The start ceremony ready to play: every line with a playable file, and which one is the gun. */
export type CeremonyPlan = { lines: { at: CueMoment; uri: string }[]; gunIndex: number };

/**
 * The pack's start ceremony, or null when the run keeps the silent visual countdown: the pack
 * has no cue, or one of its lines has no file. Never half a ceremony.
 */
export const ceremonyPlan = (pack: Pick<AudioPack, 'events'> | null, uriFor: (key: string) => string | null): CeremonyPlan | null => {
  const ceremony = pack ? ceremonySequence(pack) : null;
  if (!ceremony) return null;
  const lines = ceremony.lines.map((line) => ({ at: line.trigger.at, uri: line.source.kind === 'file' ? uriFor(line.source.key) : null }));
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
 * Lines after the gun (a roar) keep playing once the clock runs; `stop` silences them.
 */
export const playCeremony = (plan: CeremonyPlan, now: () => number, onCue: (cue: CeremonyCue) => void): Ceremony => {
  let settle: (at: number | null) => void = () => undefined;
  const gun = new Promise<number | null>((resolve) => {
    settle = resolve;
  });
  const beforeGun = (index: number) => (index < plan.gunIndex ? plan.lines[index]?.at : undefined);
  const sequence = playSequence(
    plan.lines.map((l) => l.uri),
    {
      onStart: (index, remaining, elapsed) => {
        const at = beforeGun(index);
        if (at === 'countdown') return onCue({ at, seconds: Math.ceil(remaining) });
        if (at === 'armed') return onCue({ at });
        // The status that says so lags the sound by up to one update: date the gun from the file.
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
      settle(null);
    },
  };
};
