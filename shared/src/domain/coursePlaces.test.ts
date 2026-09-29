import { describe, expect, it } from 'vitest';
import { LandmarkSchema } from '../schemas/course';
import { courseKmMarks, coursePlaces, kmMarkStep, placeLetter } from './coursePlaces';

const place = (id: string, meters: number) => LandmarkSchema.parse({ id, name: id, meters });

describe('the course card', () => {
  it('letters the places between start and finish in course order, so they never read as kilometres', () => {
    const places = coursePlaces([place('port', 6200), place('depart', 0), place('planches', 1500), place('arrivee', 10000)], 10000);
    expect(places.map((p) => [p.landmark.id, p.mark])).toEqual([
      ['depart', 'start'],
      ['planches', 'A'],
      ['port', 'B'],
      ['arrivee', 'finish'],
    ]);
  });
  it('goes on past Z with two letters', () => {
    expect(placeLetter(0)).toBe('A');
    expect(placeLetter(25)).toBe('Z');
    expect(placeLetter(26)).toBe('AA');
    expect(placeLetter(27)).toBe('AB');
  });
  it('marks every kilometre on a 10 km, and fewer on longer courses', () => {
    expect(kmMarkStep(10000)).toBe(1);
    expect(kmMarkStep(21097.5)).toBe(2);
    expect(kmMarkStep(42195)).toBe(5);
    expect(courseKmMarks(10000)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(courseKmMarks(21097.5)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(courseKmMarks(42195)).toEqual([5, 10, 15, 20, 25, 30, 35, 40]);
  });
  it('leaves off a mark that would sit on the finish', () => {
    expect(courseKmMarks(5200)).toEqual([1, 2, 3, 4]);
  });
});
