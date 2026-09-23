import { describe, expect, it } from 'vitest';
import { officialStatus } from './official';

const MARATHON = 42195;

describe('official status of an uploaded run', () => {
  it('keeps a finish that covered the course distance', () => {
    expect(officialStatus({ status: 'finished', source: 'app', distanceM: MARATHON }, MARATHON)).toBe('finished');
  });
  it('turns a finish claimed short of the distance into an abandon', () => {
    expect(officialStatus({ status: 'finished', source: 'app', distanceM: 400 }, MARATHON)).toBe('abandoned');
  });
  it('never makes a simulated run official', () => {
    expect(officialStatus({ status: 'finished', source: 'simulation', distanceM: MARATHON }, MARATHON)).toBe('abandoned');
  });
  it('leaves the other statuses alone', () => {
    expect(officialStatus({ status: 'abandoned', source: 'app', distanceM: 400 }, MARATHON)).toBe('abandoned');
    expect(officialStatus({ status: 'running', source: 'app', distanceM: 400 }, MARATHON)).toBe('running');
  });
});
