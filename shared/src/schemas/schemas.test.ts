import { describe, expect, it } from 'vitest';
import { AudioEventSchema, AudioPackSchema } from './audio';
import { CodeRequestSchema, CodeVerifySchema } from './auth';
import { EntrantSchema } from './entrant';
import { DISTANCE_METERS, RaceSchema } from './race';
import { RunSchema } from './run';

describe('race', () => {
  const base = {
    id: 'r1',
    slug: 'deauville-2026',
    name: 'Marathon International de Deauville',
    city: 'Deauville',
    dateStart: '2026-11-14',
    dateEnd: '2026-11-15',
    windowStart: '2026-11-09T00:00:00+01:00',
    windowEnd: '2026-11-15T23:59:59+01:00',
    theme: { displayName: 'Marathon de Deauville', primary: '#0b3d91', onPrimary: '#ffffff' },
  };
  it('parses with defaults', () => {
    const race = RaceSchema.parse(base);
    expect(race.status).toBe('draft');
    expect(race.country).toBe('FR');
    expect(race.theme.partnerLogos).toEqual([]);
  });
  it('rejects a slug with capitals', () => {
    expect(RaceSchema.safeParse({ ...base, slug: 'Deauville' }).success).toBe(false);
  });
  it('knows official distances', () => {
    expect(DISTANCE_METERS.marathon).toBe(42195);
    expect(DISTANCE_METERS.half).toBe(21097.5);
  });
});

describe('entrant', () => {
  it('normalizes the email', () => {
    const e = EntrantSchema.parse({
      id: 'e1', raceId: 'r1', bib: '1234', email: '  Marc@Example.COM ', firstName: 'Marc', lastName: 'D', distanceKey: 'half',
    });
    expect(e.email).toBe('marc@example.com');
    expect(e.source).toBe('import');
  });
});

describe('auth', () => {
  it('requires six digits', () => {
    const req = CodeRequestSchema.parse({ raceSlug: 'deauville-2026', bib: ' 12 ', email: 'A@b.co' });
    expect(req).toEqual({ raceSlug: 'deauville-2026', bib: '12', email: 'a@b.co' });
    expect(CodeVerifySchema.safeParse({ ...req, code: '12345' }).success).toBe(false);
    expect(CodeVerifySchema.safeParse({ ...req, code: '123456' }).success).toBe(true);
  });
});

describe('run', () => {
  it('defaults an empty run', () => {
    const run = RunSchema.parse({ id: 'x', entrantId: 'e', courseId: 'c', status: 'planned', source: 'app' });
    expect(run.splits).toEqual([]);
    expect(run.distanceM).toBe(0);
  });
});

describe('audio', () => {
  it('applies event defaults and validates a pack', () => {
    const ev = AudioEventSchema.parse({
      id: 'gun', trigger: { kind: 'start' }, source: { kind: 'file', key: 'gun.mp3' }, category: 'ceremony',
    });
    expect(ev.mix).toBe('duck');
    expect(ev.once).toBe(true);
    const pack = AudioPackSchema.parse({ courseId: 'c', version: 1, events: [ev], files: { 'gun.mp3': { url: 'gun.mp3', bytes: 10, sha256: 'x' } } });
    expect(pack.locale).toBe('fr');
  });
  it('rejects an unknown trigger kind', () => {
    expect(AudioEventSchema.safeParse({ id: 'x', trigger: { kind: 'waypoint' }, source: { kind: 'file', key: 'k' }, category: 'course' }).success).toBe(false);
  });
});
