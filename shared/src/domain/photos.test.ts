import { describe, expect, it } from 'vitest';
import { CourseSchema, PhotoMomentSchema } from '../schemas';
import { assignPhotos, canTryAgain, photoLine, photoLinesOf, courseMoments, exifTakenAt, isStale, momentAt, momentMeters, momentPasses, remixPrompt } from './photos';

const marathon = CourseSchema.parse({
  id: 'm',
  raceId: 'r',
  distanceKey: 'marathon',
  distanceM: 42195,
  landmarks: [
    { id: 'planches', name: 'Les Planches', meters: 200 },
    { id: 'hippodrome', name: 'Hippodrome', meters: 30000 },
  ],
});
const half = CourseSchema.parse({ ...marathon, id: 'h', distanceKey: 'half', distanceM: 21097.5, landmarks: [{ id: 'planches', name: 'Les Planches', meters: 200 }] });

const moment = (id: string, at: string, sort = 0) =>
  PhotoMomentSchema.parse({ id, raceId: 'r', title: id, at, ask: 'Un selfie', scene: 'La mer', sort, createdAt: '2026-09-29T10:00:00Z' });

describe('where a photo moment falls', () => {
  it('is the start, the finish, or a place of the course, on each course its own distance', () => {
    expect(momentMeters('start', marathon)).toBe(0);
    expect(momentMeters('finish', half)).toBe(21097.5);
    expect(momentMeters('hippodrome', marathon)).toBe(30000);
  });
  it('is on no course that does not pass the place: the half never sees the racecourse', () => {
    expect(momentMeters('hippodrome', half)).toBeNull();
    const moments = [moment('finish', 'finish'), moment('hippodrome', 'hippodrome'), moment('planches', 'planches')];
    expect(courseMoments(moments, half).map((m) => m.id)).toEqual(['planches', 'finish']);
    expect(courseMoments(moments, marathon).map((m) => [m.id, m.meters])).toEqual([
      ['planches', 200],
      ['hippodrome', 30000],
      ['finish', 42195],
    ]);
  });
});

describe('the moment the runner is at', () => {
  const moments = courseMoments([moment('planches', 'planches'), moment('hippodrome', 'hippodrome'), moment('finish', 'finish')], marathon);
  it('shows from just before the place to half a kilometre after', () => {
    expect(momentAt(moments, 100, 42195)).toBeNull();
    expect(momentAt(moments, 160, 42195)?.id).toBe('planches');
    expect(momentAt(moments, 690, 42195)?.id).toBe('planches');
    expect(momentAt(moments, 710, 42195)).toBeNull();
  });
  it('leaves the finish to the finish screen', () => {
    expect(momentAt(moments, 42195, 42195)).toBeNull();
  });
});

describe('making a picture', () => {
  it('may be tried three times, never while one is being made', () => {
    expect(canTryAgain({ attempts: 1, status: 'done' })).toBe(true);
    expect(canTryAgain({ attempts: 3, status: 'failed' })).toBe(false);
    expect(canTryAgain({ attempts: 1, status: 'rendering' })).toBe(false);
  });
  it('counts a picture being made for over three minutes as lost', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    expect(isStale({ status: 'rendering', updatedAt: '2026-11-12T09:58:00Z' }, now)).toBe(false);
    expect(isStale({ status: 'rendering', updatedAt: '2026-11-12T09:56:00Z' }, now)).toBe(true);
    expect(isStale({ status: 'done', updatedAt: '2026-11-12T09:00:00Z' }, now)).toBe(false);
  });
  it('asks the model for the runner, recognisable, in the race, with their bib', () => {
    const prompt = remixPrompt({ raceName: 'Marathon International de Deauville', city: 'Deauville', title: 'Sur les Planches', scene: 'La promenade en bois.', bib: '1003', refs: 2, finish: false });
    expect(prompt).toContain('person in the first image running the Marathon International de Deauville in Deauville');
    expect(prompt).toContain('The next 2 images show the real place');
    expect(prompt).toContain('number 1003');
    expect(prompt).toContain('same face');
    expect(remixPrompt({ raceName: 'R', city: 'C', title: 'Arrivée', scene: 'S', bib: '1', refs: 0, finish: true })).toContain('crossing the finish line');
  });
});

describe('when a photo was taken', () => {
  it('is its EXIF time, in its own offset when it says one, else the phone’s', () => {
    expect(exifTakenAt({ DateTimeOriginal: '2026:11:12 08:31:05', OffsetTimeOriginal: '+01:00' }, 0)).toBe(Date.parse('2026-11-12T07:31:05Z'));
    expect(exifTakenAt({ DateTimeOriginal: '2026:11:12 08:31:05' }, 60)).toBe(Date.parse('2026-11-12T07:31:05Z'));
  });
  it('is read where iOS nests it', () => {
    expect(exifTakenAt({ '{Exif}': { DateTimeOriginal: '2026:11:12 08:31:05', OffsetTimeOriginal: '-05:00' } }, 0)).toBe(Date.parse('2026-11-12T13:31:05Z'));
  });
  it('is unknown without EXIF (a screenshot, a photo sent through a chat app)', () => {
    expect(exifTakenAt({}, 60)).toBeNull();
    expect(exifTakenAt(undefined, 60)).toBeNull();
  });
});

describe('which photo goes with which moment', () => {
  const moments = courseMoments([moment('start', 'start'), moment('planches', 'planches'), moment('hippodrome', 'hippodrome'), moment('finish', 'finish')], marathon);
  const gun = Date.parse('2026-11-12T08:00:00Z');
  // 5:00/km all the way: the Planches at 1 min, the racecourse at 2 h 30, the line at 3 h 30 m 58 s.
  const splits = Array.from({ length: 42 }, (_, i) => ({ km: i + 1, splitMs: 300_000, elapsedMs: (i + 1) * 300_000 }));
  const run = { startedAtMs: gun, elapsedMs: 42 * 300_000 + 58_500, splits };
  const passes = momentPasses(moments, run, 42195);
  const min = 60_000;

  it('knows when the runner passed each moment', () => {
    expect(passes).toEqual([
      { momentId: 'start', atMs: gun },
      { momentId: 'planches', atMs: gun + 60_000 },
      { momentId: 'hippodrome', atMs: gun + 150 * min },
      { momentId: 'finish', atMs: gun + run.elapsedMs },
    ]);
  });
  it('gives each moment the photo taken closest to it: the line before the gun, the racecourse, the finish at home', () => {
    const photos = [
      { id: 'home', takenAtMs: gun + run.elapsedMs + 40 * min },
      { id: 'line', takenAtMs: gun - 10 * min },
      { id: 'horses', takenAtMs: gun + 152 * min },
      { id: 'later', takenAtMs: gun + 3 * 24 * 60 * min },
    ];
    expect(Object.fromEntries(assignPhotos(photos, passes, moments, 42195))).toEqual({ start: 'line', hippodrome: 'horses', finish: 'home' });
  });
  it('keeps one photo per moment, the closest', () => {
    const photos = [
      { id: 'a', takenAtMs: gun + 150 * min + 30_000 },
      { id: 'b', takenAtMs: gun + 158 * min },
    ];
    expect(assignPhotos(photos, passes, moments, 42195).get('hippodrome')).toBe('a');
  });
  it('puts photos with no time into the moments still empty, in course order', () => {
    const photos = [
      { id: 'timed', takenAtMs: gun + 61_000 },
      { id: 'x', takenAtMs: null },
      { id: 'y', takenAtMs: null },
    ];
    expect(Object.fromEntries(assignPhotos(photos, passes, moments, 42195))).toEqual({ planches: 'timed', start: 'x', hippodrome: 'y' });
  });
});

describe('a photo moment’s announcement', () => {
  const moments = courseMoments([moment('start', 'start'), moment('planches', 'planches'), moment('finish', 'finish')], half);
  it('is on the line before the countdown, at the place, or after the finish call', () => {
    const [start, planches, finish] = moments.map((m) => photoLine(m, 'h', half.distanceM));
    expect(start!.trigger).toEqual({ kind: 'cue', at: 'armed', order: 90 });
    expect(planches!.trigger).toEqual({ kind: 'distance', meters: 200 });
    expect(finish).toMatchObject({ trigger: { kind: 'finish' }, mix: 'wait' });
    expect(planches!.text).toBe('Moment photo ! planches. Un selfie');
  });
  it('is found in the script by its id, so the studio says which moments still need one', () => {
    const lines = [photoLine(moments[1]!, 'h', half.distanceM)];
    expect(photoLinesOf(moments, lines).map((x) => [x.moment.id, x.line !== null])).toEqual([
      ['start', false],
      ['planches', true],
      ['finish', false],
    ]);
  });
});
