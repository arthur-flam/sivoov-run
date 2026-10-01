import { describe, expect, it } from 'vitest';
import { keepsTrackingLocked, needsAlways } from './permission';

describe('the location permission, in two steps', () => {
  it('asks Android for « Toujours » once « while using » is granted, never before and never after', () => {
    expect(needsAlways(null, 'android')).toBe(false);
    expect(needsAlways('undetermined', 'android')).toBe(false);
    expect(needsAlways('denied', 'android')).toBe(false);
    expect(needsAlways('foreground', 'android')).toBe(true);
    expect(needsAlways('always', 'android')).toBe(false);
  });
  it('never asks an iPhone: « while using » already measures a run started on screen', () => {
    expect(keepsTrackingLocked('foreground', 'ios')).toBe(true);
    expect(needsAlways('foreground', 'ios')).toBe(false);
    expect(needsAlways('web', 'web')).toBe(false);
  });
});
