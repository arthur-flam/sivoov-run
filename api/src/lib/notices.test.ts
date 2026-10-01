import { describe, expect, it } from 'vitest';
import { CourseSchema, EntrantSchema, LeadSchema, RaceSchema, RunSchema } from '@sivoov/shared';
import { champsElyseesRace } from '../seed/champsElysees';
import { errorNotice, finishKind, finishNotice, leadNotice, orgSignInNotice, runnerLabel, signInNotice, startKind, startNotice, whereFrom, withEnvironment } from './notices';

const race = RaceSchema.parse({ ...champsElyseesRace, windowStart: '2027-02-06T00:00:00+01:00', windowEnd: '2027-02-08T23:59:59+01:00' });
const demo = RaceSchema.parse({ ...race, id: 'ce-demo', slug: 'ce-demo', demoOf: race.id });
const course = CourseSchema.parse({ id: 'ce-10k', raceId: race.id, distanceKey: '10k', distanceM: 10000 });
const lea = EntrantSchema.parse({ id: 'e1', raceId: race.id, bib: '2002', email: 'lea.martin@gmail.com', firstName: 'Léa', lastName: 'Martin', distanceKey: '10k' });
const tester = EntrantSchema.parse({ ...lea, email: 'lea@example.com' });

const OPEN = Date.parse('2027-02-07T09:00:00+01:00');
const BEFORE = Date.parse('2027-01-20T09:00:00+01:00');
const AFTER = Date.parse('2027-02-10T09:00:00+01:00');

const run = (fields: Partial<Parameters<typeof RunSchema.parse>[0]>) =>
  RunSchema.parse({ id: 'r1', entrantId: lea.id, courseId: course.id, status: 'finished', source: 'app', startedAt: new Date(OPEN).toISOString(), elapsedMs: 2_794_000, distanceM: 10_020, ...fields });

describe('who a line is about', () => {
  it('names a runner by name, bib and race, never by email', () => {
    expect(runnerLabel(lea, race)).toBe('Léa MARTIN (dossard 2002, 10 km des Champs-Élysées)');
    expect(signInNotice(lea, race, 'web', null)).not.toContain('gmail');
  });

  it('marks test accounts and demo races, so a tester is never taken for a real runner', () => {
    expect(runnerLabel(tester, race)).toBe('Léa MARTIN (dossard 2002, 10 km des Champs-Élysées, test)');
    expect(runnerLabel(lea, demo)).toBe('Léa MARTIN (dossard 2002, 10 km des Champs-Élysées, démo)');
  });

  it('flattens what was typed: a name cannot add lines or formatting', () => {
    const odd = { ...lea, firstName: 'Léa\n\n<b>Boss</b>' };
    expect(runnerLabel(odd, race)).toBe('Léa <b>Boss</b> MARTIN (dossard 2002, 10 km des Champs-Élysées)');
  });
});

describe('sign-in', () => {
  it('says where the runner signed in, with the phone the app reported', () => {
    expect(signInNotice(lea, race, 'app', { platform: 'android', osVersion: '16', model: 'samsung SM-S911B', appVersion: '2.0.0' })).toBe(
      '🔑 Connexion de Léa MARTIN (dossard 2002, 10 km des Champs-Élysées) sur l’app Android 16 · samsung SM-S911B · v2.0.0',
    );
    expect(signInNotice(lea, race, 'web', null)).toBe('🔑 Connexion de Léa MARTIN (dossard 2002, 10 km des Champs-Élysées) sur le web');
  });

  it('still says « l’app » for an older build that sends no phone', () => {
    expect(whereFrom('app', null)).toBe('l’app');
    expect(whereFrom('app', { platform: 'ios' })).toBe('l’app iOS');
  });
});

describe('start', () => {
  it('tells an official start from a rehearsal, a late one and a simulation, by the Worker’s clock', () => {
    expect(startKind('app', race, OPEN)).toBe('official');
    expect(startKind('app', race, BEFORE)).toBe('rehearsal');
    expect(startKind('app', race, AFTER)).toBe('closed');
    expect(startKind('simulation', race, OPEN)).toBe('simulation');
  });

  it('reads as one line', () => {
    expect(startNotice(lea, race, course, 'app', OPEN)).toBe('▶️ Départ de Léa MARTIN (dossard 2002, 10 km des Champs-Élysées) sur 10 km : course officielle');
    expect(startNotice(tester, race, course, 'app', BEFORE)).toBe('▶️ Départ de Léa MARTIN (dossard 2002, 10 km des Champs-Élysées, test) sur 10 km : répétition, avant l’ouverture');
    expect(startNotice(lea, race, course, 'simulation', OPEN)).toContain(': simulation');
  });
});

describe('finish', () => {
  it('judges the stored run like the results do', () => {
    expect(finishKind(run({}), race, course.distanceM)).toBe('official');
    expect(finishKind(run({ startedAt: new Date(BEFORE).toISOString() }), race, course.distanceM)).toBe('rehearsal');
    expect(finishKind(run({ startedAt: new Date(AFTER).toISOString() }), race, course.distanceM)).toBe('closed');
    expect(finishKind(run({ status: 'abandoned', distanceM: 3_420 }), race, course.distanceM)).toBe('incomplete');
    expect(finishKind(run({ source: 'simulation', status: 'abandoned' }), race, course.distanceM)).toBe('simulation');
    expect(finishKind(run({ startedAt: undefined }), race, course.distanceM)).toBe('incomplete');
  });

  it('gives the official distance and time of a whole run', () => {
    expect(finishNotice(lea, race, course, run({}))).toBe('🏁 Léa MARTIN (dossard 2002, 10 km des Champs-Élysées) a couru 10 km en 46:34 : officiel');
  });

  it('says how far a run went when it stopped short', () => {
    expect(finishNotice(lea, race, course, run({ status: 'abandoned', distanceM: 3_420, elapsedMs: 1_082_000 }))).toBe(
      '🏁 Léa MARTIN (dossard 2002, 10 km des Champs-Élysées) a couru 3,4 km en 18:02 : abandon',
    );
  });

  it('marks a simulation, a rehearsal and a GPX file', () => {
    expect(finishNotice(tester, demo, course, run({ source: 'simulation', status: 'abandoned' }))).toBe(
      '🏁 Léa MARTIN (dossard 2002, 10 km des Champs-Élysées, démo, test) a couru 10 km en 46:34 : simulation',
    );
    expect(finishNotice(lea, race, course, run({ startedAt: new Date(BEFORE).toISOString() }))).toContain(': répétition, non officiel');
    expect(finishNotice(lea, race, course, run({ source: 'upload', status: 'uploaded' }))).toContain(': officiel (fichier GPX)');
  });
});

describe('organizers', () => {
  const lead = LeadSchema.parse({ id: 'l1', name: 'Jean Dupont', email: 'jean@club.fr', race: 'Marathon de Lyon', message: 'Bonjour,\n\nnous organisons…', locale: 'fr', createdAt: '2026-09-29T10:00:00Z' });

  it('gives a lead’s name, race and the start of the message on a second line', () => {
    expect(leadNotice(lead)).toBe('✉️ Demande organisateur : Jean Dupont, jean@club.fr (Marathon de Lyon)\n« Bonjour, nous organisons… »');
    expect(leadNotice({ ...lead, message: undefined })).toBe('✉️ Demande organisateur : Jean Dupont, jean@club.fr (Marathon de Lyon)');
  });

  it('cuts a long message to about 200 characters', () => {
    const second = leadNotice({ ...lead, message: 'a'.repeat(1000) }).split('\n')[1]!;
    expect(second).toBe(`« ${'a'.repeat(199)}… »`);
  });

  it('marks a test lead', () => {
    expect(leadNotice({ ...lead, email: 'orga@example.com' })).toContain('(Marathon de Lyon) (test)');
  });

  it('names an organizer who signs in to the admin by email, and says staff and test', () => {
    expect(orgSignInNotice('orga@deauville.fr', false)).toBe('👤 Connexion à l’admin : orga@deauville.fr');
    expect(orgSignInNotice('arthur.flam@gmail.com', true)).toBe('👤 Connexion à l’admin : arthur.flam@gmail.com (staff)');
    expect(orgSignInNotice('orga@example.com', false)).toBe('👤 Connexion à l’admin : orga@example.com (test)');
  });
});

describe('errors and environments', () => {
  it('gives the request and the start of the error, never its stack', () => {
    const error = new TypeError(`Cannot read properties of undefined\n    at run (api.ts:12)${'x'.repeat(500)}`);
    const line = errorNotice('PUT', '/api/runs/r1', error);
    expect(line.startsWith('🔥 Erreur 500 sur PUT /api/runs/r1 : TypeError: Cannot read properties of undefined at run')).toBe(true);
    expect(line).not.toContain('\n');
    expect(line.length).toBeLessThan(400);
    expect(errorNotice('GET', '/', 'boom')).toBe('🔥 Erreur 500 sur GET / : boom');
  });

  it('prefixes every line outside production with where it comes from', () => {
    expect(withEnvironment('production', 'x')).toBe('x');
    expect(withEnvironment('preview', 'x')).toBe('[preview] x');
    expect(withEnvironment('local', 'x')).toBe('[local] x');
  });
});
