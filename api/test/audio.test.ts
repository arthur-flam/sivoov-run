import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { AudioPackSchema } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { deauvilleCourses, deauvilleRace } from '../src/seed/deauville';

const courseId = 'deauville-2026-marathon';
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const pack = AudioPackSchema.parse({
  courseId,
  version: 1,
  locale: 'fr',
  events: [
    { id: 'ceremony.intro', trigger: { kind: 'start' }, source: { kind: 'file', key: 'ceremony-intro.mp3' }, mix: 'interrupt', priority: 10, category: 'ceremony', title: 'Présentation' },
    { id: 'course.planches', trigger: { kind: 'distance', meters: 200 }, source: { kind: 'file', key: 'landmark-planches.mp3' }, mix: 'duck', priority: 6, category: 'course' },
    { id: 'personal.split', trigger: { kind: 'split', everyMeters: 1000 }, source: { kind: 'template', key: 'split', slots: ['km', 'splitTime'] }, category: 'personal', once: false },
  ],
  files: {
    'ceremony-intro.mp3': { url: `packs/${courseId}/1/ceremony-intro.mp3`, bytes: mp3.length, sha256: 'abc' },
    'landmark-planches.mp3': { url: `packs/${courseId}/1/landmark-planches.mp3`, bytes: mp3.length, sha256: 'def' },
  },
});

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await q.upsertAudioPack(pack);
  await q.upsertAudioPack({ ...pack, version: 2, events: pack.events.slice(0, 1) });
  await env.FILES.put(`packs/${courseId}/1/ceremony-intro.mp3`, mp3, { httpMetadata: { contentType: 'audio/mpeg' } });
});

describe('GET /api/courses/:id/pack', () => {
  it('serves the latest version with absolute file urls, no auth', async () => {
    const res = await SELF.fetch(`http://run.test/api/courses/${courseId}/pack`);
    expect(res.status).toBe(200);
    const body = AudioPackSchema.parse(await res.json());
    expect(body.version).toBe(2);
    expect(body.events).toHaveLength(1);
    expect(body.files['ceremony-intro.mp3']?.url).toBe(`http://localhost:8788/api/packs/${courseId}/1/ceremony-intro.mp3`);
    expect(res.headers.get('Cache-Control')).toContain('max-age');
  });
  it('404s a course without a pack', async () => {
    expect((await SELF.fetch('http://run.test/api/courses/deauville-2026-half/pack')).status).toBe(404);
  });
  it('upserting the same version replaces the manifest', async () => {
    const q = db(env.DB);
    await q.upsertAudioPack({ ...pack, version: 2, events: pack.events });
    expect((await q.latestAudioPack(courseId))?.events).toHaveLength(3);
  });
});

describe('GET /api/packs/:courseId/:version/:key', () => {
  it('streams the R2 object with immutable cache headers', async () => {
    const res = await SELF.fetch(`http://run.test/api/packs/${courseId}/1/ceremony-intro.mp3`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(mp3);
  });
  it('404s a missing file', async () => {
    expect((await SELF.fetch(`http://run.test/api/packs/${courseId}/1/nope.mp3`)).status).toBe(404);
  });
});
