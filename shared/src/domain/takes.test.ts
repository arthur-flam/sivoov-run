import { describe, expect, it } from 'vitest';
import { AudioPackSchema } from '../schemas/audio';
import { personalKey, readPack, takeOf } from './takes';

const event = {
  id: 'crowd',
  category: 'personal',
  trigger: { kind: 'filler' },
  source: { kind: 'file', key: 'crowd.mp3' },
  caption: 'Allez !',
  personal: { phase: 'prepare' },
  takes: [{ id: 'b', key: 'crowd~b.mp3', caption: 'Bravo !', when: 'restart' }],
};

describe('takeOf', () => {
  it('gives the line’s own file and words, or a take’s, or nothing for a take the pack does not have', () => {
    const e = AudioPackSchema.parse({ courseId: 'c', version: 1, events: [event], files: {} }).events[0]!;
    expect(takeOf(e)).toEqual({ key: 'crowd.mp3', caption: 'Allez !', personal: { phase: 'prepare' } });
    expect(takeOf(e, 'b')?.key).toBe('crowd~b.mp3');
    expect(takeOf(e, 'z')).toBeUndefined();
  });
  it('keeps a runner’s own version of a take apart from the line’s', () => {
    expect(personalKey('crowd')).toBe('crowd');
    expect(personalKey('crowd', 'b')).toBe('crowd/b');
  });
});

describe('readPack', () => {
  it('leaves out an event or a take it cannot read, and plays the rest', () => {
    const later = { ...event, id: 'later', trigger: { kind: 'somewhere-new' } };
    const oddTake = { ...event, id: 'odd', takes: [...event.takes, { id: 'c', key: 'crowd~c.mp3', when: 'a-new-moment' }] };
    const pack = readPack({ courseId: 'c', version: 2, events: [event, later, oddTake], files: { 'crowd.mp3': { url: 'u', bytes: 1, sha256: 's', seconds: 2 } } });
    expect(pack.events.map((e) => e.id)).toEqual(['crowd', 'odd']);
    expect(pack.events[1]!.takes!.map((t) => t.id)).toEqual(['b']);
    expect(pack.files['crowd.mp3']?.seconds).toBe(2);
  });
  it('still refuses what is not a pack at all', () => {
    expect(() => readPack({ events: [] })).toThrow();
  });
});
