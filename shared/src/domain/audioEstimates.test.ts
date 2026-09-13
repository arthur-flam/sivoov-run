import { describe, expect, it } from 'vitest';
import { AudioEventSchema } from '../schemas/audio';
import { estimateFirings, firstFirings } from './audioEstimates';

const event = (id: string, trigger: unknown) =>
  AudioEventSchema.parse({ id, trigger, source: { kind: 'file', key: `${id}.mp3` }, category: 'course' });

const MARATHON = 42195;
const PACE = 330; // 5:30 /km

describe('estimateFirings', () => {
  it('places start at zero and finish at the official distance', () => {
    const firings = estimateFirings([event('start', { kind: 'start' }), event('finish', { kind: 'finish' })], MARATHON, PACE);
    expect(firings.map((f) => [f.eventId, f.meters])).toEqual([
      ['start', 0],
      ['finish', MARATHON],
    ]);
  });

  it('turns an elapsed trigger into meters at the target pace', () => {
    const [half] = estimateFirings([event('e', { kind: 'elapsed', seconds: 3600 })], MARATHON, PACE);
    // One hour at 5:30/km is 10 909 m.
    expect(half?.meters).toBeCloseTo(10_909, 0);
    expect(half?.label).toBe('10,9 km');
  });

  it('clamps a trigger past the finish and an elapsed trigger past the cutoff', () => {
    const firings = estimateFirings([event('far', { kind: 'distance', meters: 99_000 }), event('late', { kind: 'elapsed', seconds: 99_999 })], MARATHON, PACE);
    expect(firings.every((f) => f.meters === MARATHON)).toBe(true);
  });

  it('expands a split trigger into one faint occurrence per kilometre', () => {
    const firings = estimateFirings([event('split', { kind: 'split', everyMeters: 1000 })], MARATHON, PACE);
    expect(firings).toHaveLength(42);
    expect(firings[0]).toMatchObject({ occurrence: 1, meters: 1000, recurring: false });
    expect(firings[1]).toMatchObject({ occurrence: 2, meters: 2000, recurring: true });
    expect(firings.at(-1)?.meters).toBe(42_000);
  });

  it('leaves a pace trigger unpositioned, at the end of the list', () => {
    const firings = estimateFirings([event('pace', { kind: 'pace', slowerThan: 400 }), event('km5', { kind: 'distance', meters: 5000 })], MARATHON, PACE);
    expect(firings.map((f) => f.eventId)).toEqual(['km5', 'pace']);
    expect(firings.at(-1)).toMatchObject({ meters: null, label: 'selon l’allure' });
  });

  it('orders every firing by distance and keeps the first one per event', () => {
    const firings = estimateFirings(
      [event('finish', { kind: 'finish' }), event('split', { kind: 'split', everyMeters: 10_000 }), event('start', { kind: 'start' })],
      42_195,
      PACE,
    );
    expect(firings.map((f) => f.meters)).toEqual([0, 10_000, 20_000, 30_000, 40_000, 42_195]);
    expect([...firstFirings(firings).keys()]).toEqual(['start', 'split', 'finish']);
    expect(firstFirings(firings).get('split')?.occurrence).toBe(1);
  });

  it('labels in English when asked', () => {
    const [f] = estimateFirings([event('km5', { kind: 'distance', meters: 5000 })], MARATHON, PACE, 'en');
    expect(f?.label).toBe('5.0 km');
  });
});
