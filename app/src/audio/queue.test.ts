import { describe, expect, it } from 'vitest';
import { AudioEventSchema } from '@sivoov/shared';
import { advance, emptyQueue, enqueue } from './queue';

const ev = (id: string, mix: 'duck' | 'wait' | 'interrupt', priority: number) =>
  AudioEventSchema.parse({ id, trigger: { kind: 'start' }, source: { kind: 'file', key: `${id}.mp3` }, mix, priority, category: 'course' });
const item = (id: string, mix: 'duck' | 'wait' | 'interrupt', priority: number) => ({ event: ev(id, mix, priority), uri: `file://${id}` });

describe('audio queue', () => {
  it('plays immediately when idle, lines up behind the current item otherwise', () => {
    const a = enqueue(emptyQueue(), item('a', 'duck', 5));
    expect(a.cut).toBe(false);
    expect(a.queue.current?.event.id).toBe('a');
    const b = enqueue(a.queue, item('b', 'wait', 5));
    expect(b.cut).toBe(false);
    expect(b.queue.pending.map((p) => p.event.id)).toEqual(['b']);
  });
  it('orders pending by priority, arrival order on ties', () => {
    const q = [item('b', 'duck', 3), item('c', 'duck', 8), item('d', 'duck', 3)].reduce((acc, i) => enqueue(acc, i).queue, enqueue(emptyQueue(), item('a', 'duck', 5)).queue);
    expect(q.pending.map((p) => p.event.id)).toEqual(['c', 'b', 'd']);
  });
  it('interrupt cuts the current item and drops lower-priority pending events', () => {
    const base = enqueue(enqueue(emptyQueue(), item('a', 'duck', 5)).queue, item('b', 'duck', 4)).queue;
    const { queue, cut } = enqueue(base, item('finish', 'interrupt', 10));
    expect(cut).toBe(true);
    expect(queue.current?.event.id).toBe('finish');
    expect(queue.pending).toEqual([]);
  });
  it('a low-priority interrupt does not cut a higher-priority current item', () => {
    const base = enqueue(emptyQueue(), item('gun', 'wait', 10)).queue;
    const { cut, queue } = enqueue(base, item('x', 'interrupt', 2));
    expect(cut).toBe(false);
    expect(queue.pending.map((p) => p.event.id)).toEqual(['x']);
  });
  it('advance promotes the next pending item', () => {
    const q = enqueue(enqueue(emptyQueue(), item('a', 'duck', 5)).queue, item('b', 'duck', 5)).queue;
    expect(advance(q).current?.event.id).toBe('b');
    expect(advance(advance(q)).current).toBeNull();
  });
});
