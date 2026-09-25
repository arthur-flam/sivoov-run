import { describe, expect, it } from 'vitest';
import { offsetMinutes, raceWeekWindow, toLocalInput, toZonedIso, zonedLocalToIso } from './zonedTime';

const PARIS = 'Europe/Paris';

describe('a time typed on the race’s clock', () => {
  it('becomes an instant with the winter offset in November and the summer one in June', () => {
    expect(zonedLocalToIso('2026-11-09T00:00', PARIS)).toBe('2026-11-09T00:00:00+01:00');
    expect(zonedLocalToIso('2026-06-20T08:30', PARIS)).toBe('2026-06-20T08:30:00+02:00');
  });
  it('keeps each end of a window on its own side of the clock change', () => {
    // Clocks go back at 03:00 on Sunday 25 October 2026 in Paris.
    const start = zonedLocalToIso('2026-10-24T00:00', PARIS);
    const end = zonedLocalToIso('2026-10-26T23:59', PARIS, { endOfMinute: true });
    expect(start).toBe('2026-10-24T00:00:00+02:00');
    expect(end).toBe('2026-10-26T23:59:59+01:00');
    // Three calendar days, one of them 25 hours long.
    expect(Date.parse(end!) - Date.parse(start!)).toBe((3 * 24 + 1) * 3_600_000 - 1000);
  });
  it('takes the first of the two 02:30 on the night the clocks go back', () => {
    expect(zonedLocalToIso('2026-10-25T02:30', PARIS)).toBe('2026-10-25T02:30:00+02:00');
  });
  it('moves a time that does not exist on the night the clocks go forward past the jump', () => {
    expect(zonedLocalToIso('2026-03-29T02:30', PARIS)).toBe('2026-03-29T03:30:00+02:00');
    expect(zonedLocalToIso('2026-03-29T01:59', PARIS)).toBe('2026-03-29T01:59:00+01:00');
  });
  it('works on any clock Intl knows, including half hours and the southern hemisphere', () => {
    expect(zonedLocalToIso('2026-11-09T06:00', 'America/New_York')).toBe('2026-11-09T06:00:00-05:00');
    expect(zonedLocalToIso('2026-11-09T06:00', 'Asia/Kolkata')).toBe('2026-11-09T06:00:00+05:30');
    expect(zonedLocalToIso('2026-01-10T06:00', 'Australia/Sydney')).toBe('2026-01-10T06:00:00+11:00');
    expect(zonedLocalToIso('2026-11-09T06:00', 'UTC')).toBe('2026-11-09T06:00:00+00:00');
  });
  it('refuses what is not a real date and time, and an unknown timezone', () => {
    expect(zonedLocalToIso('2026-02-30T10:00', PARIS)).toBeNull();
    expect(zonedLocalToIso('2026-11-09T24:00', PARIS)).toBeNull();
    expect(zonedLocalToIso('9 novembre', PARIS)).toBeNull();
    expect(zonedLocalToIso('', PARIS)).toBeNull();
    expect(zonedLocalToIso('2026-11-09T00:00', 'Mars/Olympus')).toBeNull();
  });
});

describe('an instant read on the race’s clock', () => {
  it('shows the wall time and the offset in force at that instant', () => {
    expect(toZonedIso('2026-11-08T23:00:00Z', PARIS)).toBe('2026-11-09T00:00:00+01:00');
    expect(toZonedIso('2026-07-01T10:00:00Z', PARIS)).toBe('2026-07-01T12:00:00+02:00');
    expect(offsetMinutes(Date.parse('2026-07-01T10:00:00Z'), PARIS)).toBe(120);
  });
  it('fills a datetime-local input and comes back unchanged', () => {
    const stored = '2026-11-15T23:59:59+01:00';
    expect(toLocalInput(stored, PARIS)).toBe('2026-11-15T23:59');
    expect(zonedLocalToIso(toLocalInput(stored, PARIS), PARIS, { endOfMinute: true })).toBe(stored);
    // An instant stored with another offset is shown on the race's clock.
    expect(toLocalInput('2026-11-08T23:00:00Z', PARIS)).toBe('2026-11-09T00:00');
  });
});

describe('the default window of a new race', () => {
  it('is Monday 00:00 to Sunday 23:59 of the week of the race', () => {
    // Deauville: Saturday 14 and Sunday 15 November 2026.
    expect(raceWeekWindow('2026-11-14', PARIS)).toEqual({ windowStart: '2026-11-09T00:00:00+01:00', windowEnd: '2026-11-15T23:59:59+01:00' });
    // A race on a Monday opens that same Monday; one on a Sunday gets the week before it.
    expect(raceWeekWindow('2026-11-09', PARIS)?.windowStart).toBe('2026-11-09T00:00:00+01:00');
    expect(raceWeekWindow('2026-11-15', PARIS)?.windowStart).toBe('2026-11-09T00:00:00+01:00');
  });
  it('follows the clock change when the week straddles it', () => {
    expect(raceWeekWindow('2026-10-25', PARIS)).toEqual({ windowStart: '2026-10-19T00:00:00+02:00', windowEnd: '2026-10-25T23:59:59+01:00' });
  });
  it('has no window without a real date', () => {
    expect(raceWeekWindow('bientôt', PARIS)).toBeNull();
  });
});
