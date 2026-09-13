import type { AudioEvent } from '@sivoov/shared';

/**
 * Pure playback queue. `mix` says how an event meets what is already playing:
 * 'interrupt' cuts it and drops queued events of lower priority, 'wait' and 'duck' line up
 * behind it (ducking against the runner's music is the audio session's job). Within the
 * queue, higher priority goes first; equal priority keeps arrival order.
 */
export type QueueItem = { event: AudioEvent; uri: string };
export type Queue = { current: QueueItem | null; pending: QueueItem[] };

export const emptyQueue = (): Queue => ({ current: null, pending: [] });

const byPriority = (items: QueueItem[]): QueueItem[] =>
  items.map((item, i) => ({ item, i })).sort((a, b) => b.item.event.priority - a.item.event.priority || a.i - b.i).map(({ item }) => item);

/** What to do when an event arrives: the new queue and whether the current item must be cut. */
export const enqueue = (queue: Queue, item: QueueItem): { queue: Queue; cut: boolean } => {
  if (!queue.current) return { queue: { current: item, pending: queue.pending }, cut: false };
  if (item.event.mix === 'interrupt' && item.event.priority >= queue.current.event.priority) {
    const kept = queue.pending.filter((p) => p.event.priority >= item.event.priority);
    return { queue: { current: item, pending: kept }, cut: true };
  }
  return { queue: { current: queue.current, pending: byPriority([...queue.pending, item]) }, cut: false };
};

/** The current item finished: promote the next one. */
export const advance = (queue: Queue): Queue => ({ current: queue.pending[0] ?? null, pending: queue.pending.slice(1) });
