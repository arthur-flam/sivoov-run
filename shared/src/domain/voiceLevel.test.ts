import { describe, expect, it } from 'vitest';
import { AudioEventSchema } from '../schemas/audio';
import type { AudioEvent } from '../schemas/audio';
import { VOICE_LEVELS, audibleAt } from './voiceLevel';

const event = (over: Partial<AudioEvent>): AudioEvent =>
  AudioEventSchema.parse({ id: 'e', trigger: { kind: 'distance', meters: 5000 }, source: { kind: 'file', key: 'e.mp3' }, category: 'course', ...over });

const heardAt = (e: AudioEvent) => VOICE_LEVELS.filter((level) => audibleAt(level, e));

describe('the runner’s voice level (moins de voix)', () => {
  it('always plays the ceremony, the start, the finish and safety', () => {
    expect(heardAt(event({ category: 'ceremony', trigger: { kind: 'start' } }))).toEqual(['all', 'course', 'essential']);
    expect(heardAt(event({ category: 'personal', trigger: { kind: 'finish' } }))).toEqual(['all', 'course', 'essential']);
    expect(heardAt(event({ category: 'personal', trigger: { kind: 'cue', at: 'armed', order: 0 } }))).toEqual(['all', 'course', 'essential']);
    expect(heardAt(event({ category: 'safety' }))).toEqual(['all', 'course', 'essential']);
  });

  it('keeps the places and every kilometre call at the course level, whatever the split’s category', () => {
    expect(heardAt(event({ category: 'course' }))).toEqual(['all', 'course']);
    expect(heardAt(event({ category: 'personal', trigger: { kind: 'split', everyMeters: 1000 } }))).toEqual(['all', 'course']);
  });

  it('keeps coaching and the personal words along the way for the runner who wants everything', () => {
    expect(heardAt(event({ category: 'coaching', trigger: { kind: 'pace', slowerThan: 420, afterMeters: 2000 } }))).toEqual(['all']);
    expect(heardAt(event({ category: 'personal' }))).toEqual(['all']);
  });
});
