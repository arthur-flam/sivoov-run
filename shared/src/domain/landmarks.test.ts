import { describe, expect, it } from 'vitest';
import { LandmarkSchema } from '../schemas/course';
import { landmarkRows, landmarkSlug, landmarksFromRows } from './landmarks';
import type { LandmarkRow } from './landmarks';

const MARATHON = 42195;
const row = (over: Partial<LandmarkRow>): LandmarkRow => ({ id: '', name: '', km: '', description: '', ...over });

describe('les lieux du parcours', () => {
  it('turn the typed rows into landmarks in course order, km stored as meters', () => {
    const out = landmarksFromRows(
      [row({ name: 'Touques', km: '3,9', description: 'On quitte la mer.' }), row({ id: 'planches', name: 'Les Planches', km: '0,2' }), row({})],
      MARATHON,
    );
    expect(out).toEqual({
      ok: true,
      landmarks: [
        { id: 'planches', name: 'Les Planches', meters: 200 },
        { id: 'touques', name: 'Touques', meters: 3900, description: 'On quitte la mer.' },
      ],
    });
    if (out.ok) out.landmarks.forEach((l) => expect(LandmarkSchema.safeParse(l).success).toBe(true));
  });

  it('drop a row left empty, which is how a place is removed', () => {
    const out = landmarksFromRows([row({ id: 'planches', name: '', km: '', description: '' })], MARATHON);
    expect(out).toEqual({ ok: true, landmarks: [] });
  });

  it('say which row is wrong and why, in the organizer’s words', () => {
    const out = landmarksFromRows([row({ name: 'Touques', km: '3,9' }), row({ km: '5' }), row({ name: 'Loin', km: '50' }), row({ name: 'Nulle part', km: 'dix' })], MARATHON);
    expect(out).toEqual({
      ok: false,
      errors: {
        1: 'Donnez un nom à ce lieu, ou videz la ligne pour le retirer.',
        2: 'Ce kilomètre est après l’arrivée (42,195 km).',
        3: 'Écrivez le kilomètre, par exemple 5,2.',
      },
    });
  });

  it('make readable ids from names, never twice the same', () => {
    expect(landmarkSlug('Hippodrome de la Touques')).toBe('hippodrome-de-la-touques');
    expect(landmarkSlug('Tourgéville')).toBe('tourgeville');
    const out = landmarksFromRows([row({ name: 'Le pont', km: '1' }), row({ name: 'Le pont', km: '2' })], MARATHON);
    expect(out.ok && out.landmarks.map((l) => l.id)).toEqual(['le-pont', 'le-pont-2']);
  });

  it('show stored landmarks back in km, and read them back unchanged', () => {
    const landmarks = [{ id: 'half', name: 'Mi-course', meters: 21097.5, description: 'La moitié.' }];
    const rows = landmarkRows(landmarks);
    expect(rows).toEqual([{ id: 'half', name: 'Mi-course', km: '21,0975', description: 'La moitié.' }]);
    expect(landmarksFromRows(rows, MARATHON)).toEqual({ ok: true, landmarks });
  });
});
