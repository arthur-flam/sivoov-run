import { describe, expect, it } from 'vitest';
import { RaceSchema } from '../schemas/race';
import { REVIEW_EMAIL, canHaveDemo, coursesShown, demoRaceFor, demoSlugFor, demoSpeedFor, reviewEntrantFor } from './demoRace';
import { windowPhase } from './raceWindow';

const source = RaceSchema.parse({
  id: 'r-champs',
  slug: '10km-champs-elysees-2027',
  name: '10 km des Champs-Élysées',
  city: 'Paris',
  dateStart: '2027-02-07',
  dateEnd: '2027-02-07',
  windowStart: '2027-02-01T00:00:00+01:00',
  windowEnd: '2027-02-07T23:59:59+01:00',
  theme: { displayName: '10 km des Champs-Élysées', primary: '#1d3b8b', onPrimary: '#ffffff' },
  status: 'open',
  supportEmail: 'contact@example.org',
});
const now = new Date('2026-09-28T10:00:00Z');

describe('a demo race', () => {
  it('looks like the real race at its own address, and points at it', () => {
    const demo = demoRaceFor(source, null, 'r-demo', now);
    expect(demo).toMatchObject({ id: 'r-demo', slug: '10km-champs-elysees-2027-demo', name: source.name, theme: source.theme, demoOf: 'r-champs', supportEmail: 'contact@example.org' });
    expect(demoSlugFor(source)).toBe(demo.slug);
  });
  it('is open from the day it is made, for two years, whatever the real race window', () => {
    const demo = demoRaceFor(source, null, 'r-demo', now);
    expect(demo.status).toBe('open');
    expect(windowPhase(demo, now.getTime())).toBe('open');
    expect(windowPhase(demo, Date.parse('2028-09-01T00:00:00Z'))).toBe('open');
    expect(windowPhase(demo, Date.parse('2028-10-01T00:00:00Z'))).toBe('after');
  });
  it('follows the real race look again when refreshed, and keeps its own address and window', () => {
    const first = demoRaceFor(source, null, 'r-demo', now);
    const moved = RaceSchema.parse({ ...source, theme: { ...source.theme, primary: '#c8102e' } });
    const again = demoRaceFor(moved, { ...first, slug: 'champs-demo' }, 'ignored', new Date('2027-06-01T00:00:00Z'));
    expect(again).toMatchObject({ id: 'r-demo', slug: 'champs-demo', windowStart: first.windowStart, windowEnd: first.windowEnd });
    expect(again.theme.primary).toBe('#c8102e');
  });
  it('is never made from another demo', () => {
    expect(canHaveDemo(source)).toBe(true);
    expect(canHaveDemo(demoRaceFor(source, null, 'r-demo', now))).toBe(false);
  });
  it('comes with App Review’s runner, on an address nobody can receive mail at', () => {
    expect(reviewEntrantFor({ id: 'r-demo' }, '10k', 'e-review')).toMatchObject({ raceId: 'r-demo', email: REVIEW_EMAIL, distanceKey: '10k', source: 'manual' });
    expect(REVIEW_EMAIL.endsWith('@example.com')).toBe(true);
  });
});

describe('the demo run', () => {
  it('plays any course in about ten minutes, and a short one at life speed', () => {
    expect(demoSpeedFor(10_000)).toBe(5);
    expect(demoSpeedFor(42_195)).toBe(21.1);
    expect(demoSpeedFor(1_500)).toBe(1);
  });
});

describe('coursesShown', () => {
  const courses = [{ id: '10k' }, { id: '5k', demo: true }];
  it('keeps a demo course off the real race’s pages and on its demo’s', () => {
    expect(coursesShown({}, courses).map((c) => c.id)).toEqual(['10k']);
    expect(coursesShown({ demoOf: 'champs' }, courses).map((c) => c.id)).toEqual(['10k', '5k']);
  });
});
