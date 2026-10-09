import { z } from 'zod';
import { AudioEventSchema, AudioPackSchema, PackTakeSchema } from '../schemas/audio';
import type { AudioEvent, AudioPack, PackTake } from '../schemas/audio';

/**
 * One way of saying a line as the pack lists it: the line's own (no take id) or one of its takes
 * (PRODUCTION.md, "Takes"): its file, its words for the screen, whether the runner has their own
 * version. Undefined for a take the pack does not have.
 */
export const takeOf = (event: AudioEvent, take?: string): Pick<PackTake, 'caption' | 'personal'> & { key?: string } | undefined =>
  take ? event.takes?.find((t) => t.id === take) : { key: event.source.kind === 'file' ? event.source.key : undefined, caption: event.caption, personal: event.personal };

/** Where a runner's own version of a line, or of one of its takes, is kept: `event` or `event/take`. */
export const personalKey = (eventId: string, take?: string): string => (take ? `${eventId}/${take}` : eventId);

/**
 * A pack as this app can play it, whatever was published after it: an event it cannot read (a
 * trigger it does not know) is left out, and so is a take, instead of failing the whole pack.
 * An older app failed a whole pack on one `filler` line (2026-10-09): this one never will.
 */
export const readPack = (raw: unknown): AudioPack => {
  const loose = AudioPackSchema.extend({ events: z.array(z.unknown()) }).parse(raw);
  const events = loose.events.flatMap((e) => {
    const takes = (e as { takes?: unknown })?.takes;
    const readable = Array.isArray(takes) ? { ...(e as object), takes: takes.filter((t) => PackTakeSchema.safeParse(t).success) } : e;
    const event = AudioEventSchema.safeParse(readable);
    return event.success ? [event.data] : [];
  });
  return { ...loose, events };
};
