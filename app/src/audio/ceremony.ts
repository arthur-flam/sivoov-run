import { ceremonySequence, countdownDigit } from '@sivoov/shared';
import type { AudioEvent, AudioPack, CueMoment } from '@sivoov/shared';
import { playSequence } from './player';
import type { Heard } from './player';
import { ambiance as sharedAmbiance } from './under';
import type { Ambiance } from './under';

type PlanLine = { event: AudioEvent; at: CueMoment; uri: string; under?: string };

/**
 * The start ceremony ready to play: every line with a playable file (and its ambiance, if any),
 * which one drives the digits (null: none) and which one is the gun (`lines.length`: none).
 */
export type CeremonyPlan = { lines: PlanLine[]; countdownIndex: number | null; gunIndex: number };

/**
 * The pack's start ceremony, or null when the run keeps the silent visual countdown: the pack
 * has no cue, or the countdown or the gun line has no sound. The countdown and the gun carry the
 * start (the digits, the clock): never without them. Any other line with no sound (a welcome
 * whose file did not come down) is left out, and the ceremony goes on without it. `soundFor`
 * picks each line's sound: the runner's own version of a personal line ("Dossard 1247, Camille
 * Martin") when it came down with the pack, the pack's offline file otherwise.
 */
export const ceremonyPlan = (
  pack: Pick<AudioPack, 'events'> | null,
  soundFor: (event: AudioEvent) => string | null,
  uriFor: (key: string) => string | null = () => null,
): CeremonyPlan | null => {
  const ceremony = pack ? ceremonySequence(pack) : null;
  if (!ceremony) return null;
  const lines = ceremony.lines.map((line, i) => {
    const under = line.under ? uriFor(line.under) : null;
    const role = i === ceremony.countdownIndex ? 'countdown' : i === ceremony.gunIndex ? 'gun' : 'other';
    return { role, line: { event: line as AudioEvent, at: line.trigger.at, uri: soundFor(line), ...(under ? { under } : {}) } };
  });
  if (lines.some((l) => l.role !== 'other' && l.line.uri === null)) return null;
  const kept = lines.filter((l): l is { role: string; line: PlanLine } => l.line.uri !== null);
  const indexOf = (role: string) => kept.findIndex((l) => l.role === role);
  return {
    lines: kept.map((l) => l.line),
    countdownIndex: indexOf('countdown') < 0 ? null : indexOf('countdown'),
    gunIndex: indexOf('gun') < 0 ? kept.length : indexOf('gun'),
  };
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

/** `onLine`: a line starts (and how long it is) or the ceremony falls silent (null), for the caption of what the speaker says. */
export type CeremonyHandlers = { onCue: (cue: CeremonyCue) => void; onLine?: (line: CeremonyPlan['lines'][number] | null, heard?: Heard) => void };

/**
 * Plays the ceremony back to back. Everything is synchronised on file boundaries: the digits
 * are the countdown file's own remaining seconds (one countdown line only, the plan's), and the
 * gun is the gun file's first second. A gun file that fails (it never loads) dates the start
 * from the end of the line before it: the runner heard « Un » then, not when the watchdog gave
 * up. Lines after the gun (a roar) keep playing once the clock runs; `stop` silences them. A
 * line's ambiance (the crowd of the start area, the music after the gun) starts with the line
 * and carries on under the next ones, into the run.
 */
export const playCeremony = (plan: CeremonyPlan, now: () => number, { onCue, onLine = () => undefined }: CeremonyHandlers, ambiance: Ambiance = sharedAmbiance): Ceremony => {
  let settle: (at: number | null) => void = () => undefined;
  let fired = false;
  let ticket: number | undefined;
  /** The countdown file's own length, known once it plays: the digits never exceed its whole seconds. */
  let countdownLength = 0;
  /** When the line before the gun ended, for a gun that never plays. */
  let beforeGunEnded: number | null = null;
  const gun = new Promise<number | null>((resolve) => {
    settle = resolve;
  });
  const digits = (remaining: number) => onCue({ at: 'countdown', seconds: countdownDigit(remaining, countdownLength) });
  const sequence = playSequence(
    plan.lines.map((l) => l.uri),
    {
      onStart: (index, remaining, elapsed) => {
        onLine(plan.lines[index] ?? null, { elapsedS: elapsed, remainingS: remaining });
        const under = plan.lines[index]?.under;
        if (under) ticket = ambiance.start(under);
        if (index === plan.countdownIndex) {
          countdownLength = remaining + elapsed;
          return digits(remaining);
        }
        if (index < plan.gunIndex) return onCue({ at: 'armed' });
        if (index > plan.gunIndex) return;
        // The status that says so lags the sound by up to one update: date the gun from the file.
        fired = true;
        settle(now() - elapsed * 1000);
      },
      onRemaining: (index, remaining) => {
        if (index === plan.countdownIndex) digits(remaining);
      },
      onEnd: (index) => {
        if (index === plan.gunIndex - 1) beforeGunEnded = now();
      },
      onDone: () => {
        onLine(null);
        settle(now());
      },
      onFail: (index) => {
        onLine(null);
        settle(index < plan.gunIndex ? null : index === plan.gunIndex ? (beforeGunEnded ?? now()) : now());
      },
    },
  );
  return {
    gun,
    stop: () => {
      sequence.stop();
      onLine(null);
      // Before the gun the ambiance is the ceremony's; after it, the run's (it fades on its own).
      if (!fired) ambiance.stop(ticket);
      settle(null);
    },
  };
};
