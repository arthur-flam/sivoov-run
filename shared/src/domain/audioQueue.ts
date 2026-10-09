import type { AudioEvent } from '../schemas/audio';

/**
 * Pure playback queue: the app's player (app/src/audio/player.ts), and the production tool's full
 * runs on paper, which must play exactly like it. `mix` says how an event meets what is already playing:
 * 'interrupt' cuts it and drops queued events of lower priority, 'wait' and 'duck' line up
 * behind it (ducking against the runner's music is the audio session's job). Within the
 * queue, higher priority goes first; equal priority keeps arrival order. `under` is the
 * playable uri of the event's ambiance, when it has one.
 */
export type QueueItem = { event: AudioEvent; uri: string; under?: string };
export type Queue<I extends QueueItem = QueueItem> = { current: I | null; pending: I[] };

export const emptyQueue = <I extends QueueItem = QueueItem>(): Queue<I> => ({ current: null, pending: [] });

const byPriority = <I extends QueueItem>(items: I[]): I[] =>
  items.map((item, i) => ({ item, i })).sort((a, b) => b.item.event.priority - a.item.event.priority || a.i - b.i).map(({ item }) => item);

/** What to do when an event arrives: the new queue and whether the current item must be cut. */
export const enqueue = <I extends QueueItem>(queue: Queue<I>, item: I): { queue: Queue<I>; cut: boolean } => {
  if (!queue.current) return { queue: { current: item, pending: queue.pending }, cut: false };
  if (item.event.mix === 'interrupt' && item.event.priority >= queue.current.event.priority) {
    const kept = queue.pending.filter((p) => p.event.priority >= item.event.priority);
    return { queue: { current: item, pending: kept }, cut: true };
  }
  return { queue: { current: queue.current, pending: byPriority([...queue.pending, item]) }, cut: false };
};

/** The current item finished: promote the next one. */
export const advance = <I extends QueueItem>(queue: Queue<I>): Queue<I> => ({ current: queue.pending[0] ?? null, pending: queue.pending.slice(1) });
