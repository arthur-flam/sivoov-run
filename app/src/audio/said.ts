import { create } from 'zustand';
import type { AudioEvent, VoiceLevel } from '@sivoov/shared';
import { audibleAt } from '@sivoov/shared';

/**
 * One line of the race as the runner can read it back: what fired, when, what it says and
 * whether it was heard. The run screen's caption and its list of announcements read this;
 * the trace keeps its own record (`useRun().fired`).
 */
export type SaidLine = {
  /** Unique per firing: the trigger key (`course.planches`, `personal.split#3`), `cue:<id>` for the ceremony. */
  key: string;
  event: AudioEvent;
  /** The words, when known: the runner's own version, else the line's caption. Null for an older pack. */
  text: string | null;
  distanceM: number;
  elapsedMs: number;
  /**
   * 'heard': a sound played (or is about to). 'silenced': the runner's voice level skipped it.
   * 'silent': the line has no sound at all (a course with no produced voice yet): read only.
   */
  sound: 'heard' | 'silenced' | 'silent';
  /** What played, for « Réécouter ». */
  uri: string | null;
  /** When it fired, on the phone's clock: a line with no sound shows for a few seconds from then. */
  at: number;
};

/** The words of a line: the runner's own version when it has one, else what the pack says it says. */
export const captionFor = (event: AudioEvent, own: Record<string, string>): string | null => own[event.id] ?? event.caption ?? null;

/** How a fired line sounds at the runner's level, given the sound it would play. */
export const soundOf = (level: VoiceLevel, event: AudioEvent, uri: string | null): SaidLine['sound'] => (!audibleAt(level, event) ? 'silenced' : uri ? 'heard' : 'silent');

/** Where the speaking line's sound is, on the phone's clock: when it began and how long it lasts. */
export type SpeechTiming = { startedAt: number; durationMs: number };

type SaidStore = {
  lines: SaidLine[];
  /** The event whose sound is playing now, or null between lines. */
  speaking: string | null;
  /** The speaking line's timing, once its sound is heard (null before, and between lines). */
  timing: SpeechTiming | null;
  add: (line: SaidLine) => void;
  /** A live line's own words and sound arrive after it fired. */
  update: (key: string, patch: Partial<Pick<SaidLine, 'text' | 'uri' | 'sound'>>) => void;
  setSpeaking: (eventId: string | null) => void;
  /** The speaking line's sound started, `heard` seconds in with `remaining` to go. */
  setHeard: (eventId: string, heard: { elapsedS: number; remainingS: number }) => void;
  reset: () => void;
};

export const useSaid = create<SaidStore>((set, get) => ({
  lines: [],
  speaking: null,
  timing: null,
  add: (line) => set({ lines: [...get().lines.filter((l) => l.key !== line.key), line] }),
  update: (key, patch) => set({ lines: get().lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }),
  setSpeaking: (speaking) => set(speaking === get().speaking ? { speaking } : { speaking, timing: null }),
  setHeard: (eventId, { elapsedS, remainingS }) => {
    if (get().speaking !== eventId) return;
    set({ timing: { startedAt: Date.now() - elapsedS * 1000, durationMs: (elapsedS + remainingS) * 1000 } });
  },
  reset: () => set({ lines: [], speaking: null, timing: null }),
}));

/** How long a line with no sound stays on screen, and how long a spoken one lingers after its sound. */
export const SILENT_CAPTION_MS = 7000;
export const LINGER_MS = 1500;

/**
 * The line the caption shows: the one speaking, else the latest line with no sound while it is
 * fresh. A line the runner silenced never pops up: they asked for less. `lingerUntil` keeps a
 * line that just finished on screen a moment, so the caption does not blink between two lines.
 */
export const captionLine = (lines: SaidLine[], speaking: string | null, now: number, lingering: SaidLine | null = null): SaidLine | null => {
  const latest = (pred: (l: SaidLine) => boolean) => [...lines].reverse().find(pred) ?? null;
  if (speaking) return latest((l) => l.event.id === speaking && l.sound === 'heard') ?? latest((l) => l.event.id === speaking);
  if (lingering) return lingering;
  const fresh = latest((l) => l.sound === 'silent');
  return fresh && now - fresh.at < SILENT_CAPTION_MS ? fresh : null;
};
