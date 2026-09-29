import { describe, expect, it } from 'vitest';
import { AudioEventSchema } from '../schemas/audio';
import { ceremonyIssues } from './ceremonyChecks';

const cue = (id: string, at: 'armed' | 'countdown' | 'gun', order = 1) =>
  AudioEventSchema.parse({ id, trigger: { kind: 'cue', at, order }, source: { kind: 'file', key: `${id}.mp3` }, category: 'ceremony' });
const intro = cue('intro', 'armed');
const countdown = cue('countdown', 'countdown');
const gun = cue('gun', 'gun');
const lengths = (seconds: Record<string, number>) => (id: string) => seconds[id] ?? null;

describe('the start ceremony, checked before it goes out', () => {
  it('is fine with one countdown of ten seconds, give or take its padding, followed by the gun', () => {
    expect(ceremonyIssues([intro, countdown, gun], lengths({ countdown: 10.03 }))).toEqual({});
    expect(ceremonyIssues([intro, countdown, gun], lengths({ countdown: 9.8 }))).toEqual({});
  });

  it('warns when the countdown is not ten seconds long: the digits would not match the voice', () => {
    expect(ceremonyIssues([intro, countdown, gun], lengths({ countdown: 7.44 }))).toEqual({ countdown: [{ code: 'countdown_length', seconds: 7.4 }] });
    expect(ceremonyIssues([countdown, gun], lengths({ countdown: 10.5 }))).toEqual({ countdown: [{ code: 'countdown_length', seconds: 10.5 }] });
  });

  it('does not judge a countdown whose sound is not recorded yet', () => {
    expect(ceremonyIssues([countdown, gun], lengths({}))).toEqual({});
  });

  it('says which countdown shows no digits when there are two', () => {
    const second = cue('again', 'countdown', 2);
    expect(ceremonyIssues([countdown, second, gun], lengths({ countdown: 4, again: 10 }))).toEqual({ countdown: [{ code: 'countdown_twice' }] });
  });

  it('warns about a countdown with no gun after it', () => {
    expect(ceremonyIssues([intro, countdown], lengths({ countdown: 10 }))).toEqual({ countdown: [{ code: 'countdown_without_gun' }] });
  });

  it('has nothing to say about a ceremony with no countdown, or no ceremony', () => {
    expect(ceremonyIssues([intro, gun], lengths({}))).toEqual({});
    expect(ceremonyIssues([], lengths({}))).toEqual({});
  });
});
