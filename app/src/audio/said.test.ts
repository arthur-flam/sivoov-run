import { beforeEach, describe, expect, it } from 'vitest';
import { AudioEventSchema } from '@sivoov/shared';
import type { AudioEvent } from '@sivoov/shared';
import { LINGER_MS, SILENT_CAPTION_MS, captionFor, captionLine, soundOf, useSaid } from './said';
import type { SaidLine } from './said';

const event = (over: Partial<AudioEvent> = {}): AudioEvent =>
  AudioEventSchema.parse({ id: 'course.planches', trigger: { kind: 'distance', meters: 5000 }, source: { kind: 'file', key: 'planches.mp3' }, category: 'course', title: 'Les Planches', ...over });

const said = (over: Partial<SaidLine> = {}): SaidLine => ({ key: 'course.planches', event: event(), text: 'Les Planches.', distanceM: 5000, elapsedMs: 1_500_000, sound: 'heard', uri: 'file://planches.mp3', at: 10_000, ...over });

describe('the words of a line', () => {
  it('are the runner’s own version when it came down, else the pack’s caption, else unknown', () => {
    const call = event({ id: 'ceremony.call', caption: 'Coureurs, sur la ligne.' });
    expect(captionFor(call, { 'ceremony.call': 'Dossard 1002, Léa Martin !' })).toBe('Dossard 1002, Léa Martin !');
    expect(captionFor(call, {})).toBe('Coureurs, sur la ligne.');
    expect(captionFor(event(), {})).toBeNull();
  });

  it('are the take’s when the engine chose one: the runner’s own by line and take, else the take’s caption', () => {
    const cheers = event({ id: 'cheers', caption: 'Allez !', takes: [{ id: 'a', key: 'cheers~a.mp3', caption: 'Allez, on y va !' }, { id: 'b', key: 'cheers~b.mp3' }] });
    expect(captionFor(cheers, { 'cheers/a': 'Allez Léa !' }, 'a')).toBe('Allez Léa !');
    expect(captionFor(cheers, {}, 'a')).toBe('Allez, on y va !');
    // A take with no words of its own (a file) says nothing on screen, not the line's words.
    expect(captionFor(cheers, {}, 'b')).toBeNull();
    expect(captionFor(cheers, { 'cheers/a': 'Allez Léa !' })).toBe('Allez !');
  });
});

describe('how a fired line sounds', () => {
  it('is heard when it has a sound at the runner’s level, silenced below it, silent with no sound at all', () => {
    const coaching = event({ category: 'coaching' });
    expect(soundOf('all', coaching, 'file://a.mp3')).toBe('heard');
    expect(soundOf('course', coaching, 'file://a.mp3')).toBe('silenced');
    expect(soundOf('all', coaching, null)).toBe('silent');
  });
});

describe('the caption on the run screen', () => {
  it('shows the line that is speaking, the latest firing of it', () => {
    const lines = [said({ key: 'personal.split#1', event: event({ id: 'personal.split' }), text: 'Kilomètre un.' }), said({ key: 'personal.split#2', event: event({ id: 'personal.split' }), text: 'Kilomètre deux.' })];
    expect(captionLine(lines, 'personal.split', 20_000)?.text).toBe('Kilomètre deux.');
  });

  it('keeps a line that just finished on screen a moment instead of blinking', () => {
    const line = said();
    expect(captionLine([line], null, 20_000, line)).toBe(line);
    expect(LINGER_MS).toBeGreaterThan(0);
  });

  it('shows a line with no sound for a few seconds, then nothing', () => {
    const line = said({ sound: 'silent', uri: null, at: 10_000 });
    expect(captionLine([line], null, 10_000 + 1000)).toBe(line);
    expect(captionLine([line], null, 10_000 + SILENT_CAPTION_MS + 1)).toBeNull();
  });

  it('never pops up a line the runner silenced', () => {
    expect(captionLine([said({ sound: 'silenced', at: 10_000 })], null, 10_500)).toBeNull();
  });
});

describe('the list of what was said', () => {
  beforeEach(() => useSaid.getState().reset());

  it('keeps each firing once, in order, and takes a live line’s own words when they arrive', () => {
    useSaid.getState().add(said({ key: 'a' }));
    useSaid.getState().add(said({ key: 'b', text: 'Kilomètre cinq.' }));
    useSaid.getState().add(said({ key: 'a' }));
    useSaid.getState().update('b', { text: 'Kilomètre cinq, vingt-sept minutes trente.' });
    expect(useSaid.getState().lines.map((l) => [l.key, l.text])).toEqual([
      ['b', 'Kilomètre cinq, vingt-sept minutes trente.'],
      ['a', 'Les Planches.'],
    ]);
  });
});
