import { describe, expect, it } from 'vitest';
import { CourseSchema, PhotoMomentSchema } from '../schemas';
import { canTryAgain, courseMoments, isStale, momentAt, momentMeters, remixPrompt } from './photos';

const marathon = CourseSchema.parse({
  id: 'm',
  raceId: 'r',
  distanceKey: 'marathon',
  distanceM: 42195,
  landmarks: [
    { id: 'planches', name: 'Les Planches', meters: 200 },
    { id: 'hippodrome', name: 'Hippodrome', meters: 30000 },
  ],
});
const half = CourseSchema.parse({ ...marathon, id: 'h', distanceKey: 'half', distanceM: 21097.5, landmarks: [{ id: 'planches', name: 'Les Planches', meters: 200 }] });

const moment = (id: string, at: string, sort = 0) =>
  PhotoMomentSchema.parse({ id, raceId: 'r', title: id, at, ask: 'Un selfie', scene: 'La mer', sort, createdAt: '2026-09-29T10:00:00Z' });

describe('where a photo moment falls', () => {
  it('is the start, the finish, or a place of the course, on each course its own distance', () => {
    expect(momentMeters('start', marathon)).toBe(0);
    expect(momentMeters('finish', half)).toBe(21097.5);
    expect(momentMeters('hippodrome', marathon)).toBe(30000);
  });
  it('is on no course that does not pass the place: the half never sees the racecourse', () => {
    expect(momentMeters('hippodrome', half)).toBeNull();
    const moments = [moment('finish', 'finish'), moment('hippodrome', 'hippodrome'), moment('planches', 'planches')];
    expect(courseMoments(moments, half).map((m) => m.id)).toEqual(['planches', 'finish']);
    expect(courseMoments(moments, marathon).map((m) => [m.id, m.meters])).toEqual([
      ['planches', 200],
      ['hippodrome', 30000],
      ['finish', 42195],
    ]);
  });
});

describe('the moment the runner is at', () => {
  const moments = courseMoments([moment('planches', 'planches'), moment('hippodrome', 'hippodrome'), moment('finish', 'finish')], marathon);
  it('shows from just before the place to half a kilometre after', () => {
    expect(momentAt(moments, 100, 42195)).toBeNull();
    expect(momentAt(moments, 160, 42195)?.id).toBe('planches');
    expect(momentAt(moments, 690, 42195)?.id).toBe('planches');
    expect(momentAt(moments, 710, 42195)).toBeNull();
  });
  it('leaves the finish to the finish screen', () => {
    expect(momentAt(moments, 42195, 42195)).toBeNull();
  });
});

describe('making a picture', () => {
  it('may be tried three times, never while one is being made', () => {
    expect(canTryAgain({ attempts: 1, status: 'done' })).toBe(true);
    expect(canTryAgain({ attempts: 3, status: 'failed' })).toBe(false);
    expect(canTryAgain({ attempts: 1, status: 'rendering' })).toBe(false);
  });
  it('counts a picture being made for over three minutes as lost', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    expect(isStale({ status: 'rendering', updatedAt: '2026-11-12T09:58:00Z' }, now)).toBe(false);
    expect(isStale({ status: 'rendering', updatedAt: '2026-11-12T09:56:00Z' }, now)).toBe(true);
    expect(isStale({ status: 'done', updatedAt: '2026-11-12T09:00:00Z' }, now)).toBe(false);
  });
  it('asks the model for the runner, recognisable, in the race, with their bib', () => {
    const prompt = remixPrompt({ raceName: 'Marathon International de Deauville', city: 'Deauville', title: 'Sur les Planches', scene: 'La promenade en bois.', bib: '1003', refs: 2, finish: false });
    expect(prompt).toContain('person in the first image running the Marathon International de Deauville in Deauville');
    expect(prompt).toContain('The next 2 images show the real place');
    expect(prompt).toContain('number 1003');
    expect(prompt).toContain('same face');
    expect(remixPrompt({ raceName: 'R', city: 'C', title: 'Arrivée', scene: 'S', bib: '1', refs: 0, finish: true })).toContain('crossing the finish line');
  });
});
