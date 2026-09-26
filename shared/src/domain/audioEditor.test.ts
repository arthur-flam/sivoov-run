import { describe, expect, it } from 'vitest';
import { AudioTriggerSchema } from '../schemas/audio';
import type { AudioTrigger } from '../schemas/audio';
import {
  durationFr,
  editorFromTrigger,
  kmInput,
  metersFromKm,
  minutesInput,
  momentOf,
  paceFromInput,
  parseDecimal,
  secondsFromMinutes,
  speechSeconds,
  triggerFromEditor,
  whenInWords,
} from './audioEditor';
import type { EditorWhen } from './audioEditor';

const MARATHON = 42195;
const when = (over: Partial<EditorWhen>): EditorWhen => ({ kind: 'distance', km: '', minutes: '', everyKm: '1', slowerThan: '', fasterThan: '', afterKm: '1', cueAt: 'armed', cueOrder: '1', ...over });

describe('what the organizer types', () => {
  it('reads decimals with a comma or a point, and refuses anything else', () => {
    expect(parseDecimal('5,2')).toBe(5.2);
    expect(parseDecimal(' 5.2 ')).toBe(5.2);
    expect(parseDecimal('12')).toBe(12);
    expect(parseDecimal('0,5')).toBe(0.5);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('cinq')).toBeNull();
    expect(parseDecimal('-3')).toBeNull();
  });

  it('turns kilometres into the meters the script stores, and back without drift', () => {
    expect(metersFromKm('5,2')).toBe(5200);
    expect(metersFromKm('21,0975')).toBe(21097.5);
    expect(metersFromKm('abc')).toBeNull();
    expect(kmInput(5200)).toBe('5,2');
    expect(kmInput(200)).toBe('0,2');
    // What the input shows reads back to the very same distance: saving another field moves nothing.
    [200, 3000.4, 21097.5, 42195].forEach((m) => expect(metersFromKm(kmInput(m))).toBe(m));
  });

  it('turns minutes into seconds, and back', () => {
    expect(secondsFromMinutes('90')).toBe(5400);
    expect(secondsFromMinutes('1,5')).toBe(90);
    expect(minutesInput(90)).toBe('1,5');
    expect(secondsFromMinutes(minutesInput(100))).toBe(100);
  });

  it('reads a pace as 6:30, 6 or 6,5 minutes per km', () => {
    expect(paceFromInput('6:30')).toBe(390);
    expect(paceFromInput('6')).toBe(360);
    expect(paceFromInput('6,5')).toBe(390);
    expect(paceFromInput('6:75')).toBeNull();
    expect(paceFromInput('vite')).toBeNull();
  });
});

describe('the Quand fields', () => {
  it('store a distance in km as meters and a time in minutes as seconds', () => {
    expect(triggerFromEditor(when({ kind: 'distance', km: '5,2' }))).toEqual({ kind: 'distance', meters: 5200 });
    expect(triggerFromEditor(when({ kind: 'elapsed', minutes: '90' }))).toEqual({ kind: 'elapsed', seconds: 5400 });
    expect(triggerFromEditor(when({ kind: 'split', everyKm: '2' }))).toEqual({ kind: 'split', everyMeters: 2000 });
    expect(triggerFromEditor(when({ kind: 'start' }))).toEqual({ kind: 'start' });
    expect(triggerFromEditor(when({ kind: 'finish' }))).toEqual({ kind: 'finish' });
  });

  it('store pace coaching in seconds per km from the km it starts at', () => {
    const t = triggerFromEditor(when({ kind: 'pace', slowerThan: '6:30', afterKm: '2' }));
    expect(t).toEqual({ kind: 'pace', slowerThan: 390, afterMeters: 2000 });
    expect(AudioTriggerSchema.safeParse(t).success).toBe(true);
    expect(triggerFromEditor(when({ kind: 'pace', slowerThan: '6:30', fasterThan: '4:30', afterKm: '' }))).toEqual({
      kind: 'pace',
      slowerThan: 390,
      fasterThan: 270,
      afterMeters: 0,
    });
  });

  it('refuse what cannot be stored, so the editor can point at the field', () => {
    expect(triggerFromEditor(when({ kind: 'distance', km: '' }))).toBeNull();
    expect(triggerFromEditor(when({ kind: 'elapsed', minutes: 'une heure' }))).toBeNull();
    expect(triggerFromEditor(when({ kind: 'split', everyKm: '0' }))).toBeNull();
    // A pace announcement needs at least one limit.
    expect(triggerFromEditor(when({ kind: 'pace' }))).toBeNull();
  });

  it('show every stored trigger in the units the organizer typed', () => {
    const triggers: AudioTrigger[] = [
      { kind: 'distance', meters: 21097.5 },
      { kind: 'elapsed', seconds: 5400 },
      { kind: 'split', everyMeters: 1000 },
      { kind: 'pace', slowerThan: 390, afterMeters: 2000 },
      { kind: 'start' },
      { kind: 'finish' },
    ];
    triggers.forEach((t) => expect(triggerFromEditor(editorFromTrigger(t))).toEqual(t));
    expect(editorFromTrigger({ kind: 'distance', meters: 5200 }).km).toBe('5,2');
    expect(editorFromTrigger({ kind: 'pace', slowerThan: 390, afterMeters: 2000 }).slowerThan).toBe('6:30');
  });
});

describe('when an announcement plays, in plain words', () => {
  it('says it the way a race director would', () => {
    expect(whenInWords({ kind: 'start' })).toBe('Au départ');
    expect(whenInWords({ kind: 'finish' })).toBe('À l’arrivée');
    expect(whenInWords({ kind: 'distance', meters: 5200 })).toBe('Au km 5,2');
    expect(whenInWords({ kind: 'distance', meters: 21097.5 })).toBe('Au km 21,1');
    expect(whenInWords({ kind: 'distance', meters: 0 })).toBe('Au départ');
    expect(whenInWords({ kind: 'elapsed', seconds: 5400 })).toBe('À 1 h 30 de course');
    expect(whenInWords({ kind: 'elapsed', seconds: 90 })).toBe('À 1 min 30 s de course');
    expect(whenInWords({ kind: 'elapsed', seconds: 0 })).toBe('Au départ');
    expect(whenInWords({ kind: 'split', everyMeters: 1000 })).toBe('Tous les km');
    expect(whenInWords({ kind: 'split', everyMeters: 5000 })).toBe('Tous les 5 km');
    expect(whenInWords({ kind: 'pace', slowerThan: 390, afterMeters: 1000 })).toBe('Si le coureur ralentit');
    expect(whenInWords({ kind: 'pace', fasterThan: 270, afterMeters: 1000 })).toBe('Si le coureur va trop vite');
  });

  it('writes durations the French way', () => {
    expect(durationFr(45)).toBe('45 s');
    expect(durationFr(720)).toBe('12 min');
    expect(durationFr(3600)).toBe('1 h');
    expect(durationFr(3900)).toBe('1 h 05');
  });
});

describe('moments', () => {
  it('group announcements by when the runner hears them', () => {
    expect(momentOf({ kind: 'start' }, MARATHON)).toBe('start');
    expect(momentOf({ kind: 'elapsed', seconds: 0 }, MARATHON)).toBe('start');
    expect(momentOf({ kind: 'distance', meters: 0 }, MARATHON)).toBe('start');
    expect(momentOf({ kind: 'distance', meters: 200 }, MARATHON)).toBe('course');
    expect(momentOf({ kind: 'elapsed', seconds: 3600 }, MARATHON)).toBe('course');
    expect(momentOf({ kind: 'split', everyMeters: 1000 }, MARATHON)).toBe('always');
    expect(momentOf({ kind: 'pace', slowerThan: 400, afterMeters: 0 }, MARATHON)).toBe('always');
    expect(momentOf({ kind: 'distance', meters: MARATHON }, MARATHON)).toBe('finish');
    expect(momentOf({ kind: 'finish' }, MARATHON)).toBe('finish');
  });
});

describe('speechSeconds', () => {
  it('estimates reading time at about 15 characters a second', () => {
    expect(speechSeconds('Partez !')).toBe(1);
    expect(speechSeconds('a'.repeat(150))).toBe(10);
  });
});

describe('the start ceremony in the editor', () => {
  it('reads a cue back as it was stored', () => {
    const cue = { kind: 'cue', at: 'countdown', order: 2 } as const;
    expect(triggerFromEditor(editorFromTrigger(cue))).toEqual(cue);
  });
  it('refuses a cue with no order or an unknown moment', () => {
    const when = editorFromTrigger({ kind: 'cue', at: 'gun', order: 1 });
    expect(triggerFromEditor({ ...when, cueOrder: '' })).toBeNull();
    expect(triggerFromEditor({ ...when, cueAt: 'halftime' })).toBeNull();
  });
  it('says when it plays, and files it with the start', () => {
    expect(whenInWords({ kind: 'cue', at: 'armed', order: 1 })).toBe('Avant le départ · Sur la ligne');
    expect(momentOf({ kind: 'cue', at: 'gun', order: 1 }, 21097.5)).toBe('start');
  });
});
