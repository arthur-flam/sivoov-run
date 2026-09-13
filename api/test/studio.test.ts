import { SELF, env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AudioPackSchema, buildTrack, deauvilleMarathonGeometry } from '@sivoov/shared';
import type { AudioScriptInput } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { orgDb } from '../src/db/orgQueries';
import { scriptDb } from '../src/db/scriptQueries';
import { deauvilleCourses, deauvilleOrganizers, deauvilleRace } from '../src/seed/deauville';

const SLUG = 'deauville-2026';
const base = `http://run.test/org/${SLUG}`;
const COURSE = `${SLUG}-10k`;
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2a]);

/** Five points along the Deauville seafront: enough to be a course, small enough to read. */
const GPX = `<?xml version="1.0"?><gpx version="1.1"><trk><name>Dix kilomètres</name><trkseg>
<trkpt lat="49.3610" lon="0.0730"/><trkpt lat="49.3620" lon="0.0760"/><trkpt lat="49.3640" lon="0.0800"/>
<trkpt lat="49.3660" lon="0.0840"/><trkpt lat="49.3680" lon="0.0880"/>
</trkseg></trk></gpx>`;

const script = (lines: AudioScriptInput['lines']): AudioScriptInput => ({
  courseId: COURSE,
  version: 1,
  locale: 'fr',
  voice: { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', model: 'eleven_multilingual_v2' },
  lines,
});

const TWO_LINES = script([
  { id: 'ceremony.gun', title: 'Le départ', category: 'ceremony', mix: 'wait', priority: 10, trigger: { kind: 'start' }, key: 'gun', text: 'Partez !' },
  { id: 'course.digue', title: 'La digue', category: 'course', mix: 'duck', priority: 6, trigger: { kind: 'distance', meters: 3000 }, key: 'digue', text: 'Vous longez la digue.' },
]);

let cookie = '';
/**
 * The worker under test shares this isolate, so stubbing the global fetch stubs ElevenLabs
 * for it (this version of vitest-pool-workers exposes no `fetchMock`). `ttsCalls` counts the
 * provider calls, which is how the R2 cache is asserted.
 */
const realFetch = globalThis.fetch;
let ttsCalls: string[] = [];

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all(deauvilleOrganizers.map((o) => orgDb(env.DB).upsertOrganizer(o)));
  // The seeded marathon's trace, as `npm run seed` puts it in R2.
  await env.FILES.put('courses/deauville-2026-marathon.json', JSON.stringify(deauvilleMarathonGeometry), {
    httpMetadata: { contentType: 'application/json' },
  });
  const res = await SELF.fetch(`${base}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ step: 'code', email: 'orga@example.com', code: env.TEST_CODE! }).toString(),
    redirect: 'manual',
  });
  expect(res.status).toBe(302);
  cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.elevenlabs.io/')) {
      ttsCalls = [...ttsCalls, url];
      return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } });
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

const get = (path: string) => SELF.fetch(`${base}${path}`, { headers: { Cookie: cookie } });
const send = (path: string, body: unknown, method = 'POST') =>
  SELF.fetch(`${base}${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('courses page', () => {
  it('needs a session, then lists the race courses with their status', async () => {
    expect((await SELF.fetch(`${base}/courses`, { redirect: 'manual' })).status).toBe(302);
    const html = await (await get('/courses')).text();
    expect(html).toContain('Parcours et audio');
    expect(html).toContain('Marathon');
    expect(html).toContain('Ouvrir le studio');
    // The seeded marathon has a trace in R2 (42,4 km measured) and nine landmarks.
    expect(html).toContain('42,41 km mesurés');
    expect(html).toContain('aucun script');
  });

  it('creates a course and refuses a second one on the same distance', async () => {
    const form = (fields: Record<string, string>) =>
      SELF.fetch(`${base}/courses`, {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
        redirect: 'manual',
      });
    const created = await form({ distanceKey: '10k', distanceM: '10000' });
    expect(created.status).toBe(302);
    expect(created.headers.get('location')).toBe(`/org/${SLUG}/courses/${COURSE}`);
    const course = await db(env.DB).courseById(COURSE);
    expect(course?.distanceM).toBe(10_000);
    expect(course?.geometryKey).toBeUndefined();
    expect(await (await form({ distanceKey: '10k', distanceM: '10000' })).text()).toContain('déjà un parcours');
  });

  it('stores an uploaded GPX as the course geometry and measures it', async () => {
    const fd = new FormData();
    fd.append('gpx', new File([GPX], 'parcours.gpx', { type: 'application/gpx+xml' }));
    const res = await SELF.fetch(`${base}/courses/${COURSE}/gpx`, { method: 'POST', headers: { Cookie: cookie }, body: fd, redirect: 'manual' });
    expect(res.status).toBe(302);
    const key = `courses/${COURSE}/geometry.json`;
    expect((await db(env.DB).courseById(COURSE))?.geometryKey).toBe(key);
    const object = await env.FILES.get(key);
    const geometry = (await object!.json()) as { courseId: string; points: unknown[] };
    expect(geometry.courseId).toBe(COURSE);
    expect(geometry.points).toHaveLength(5);
    const measured = Math.round(buildTrack(geometry.points as { lat: number; lng: number }[]).totalM);
    expect(res.headers.get('location')).toBe(`/org/${SLUG}/courses/${COURSE}#gpx-${measured}`);
    expect(measured).toBeGreaterThan(1000);
  });

  it('refuses a GPX with no track points', async () => {
    const fd = new FormData();
    fd.append('gpx', new File(['<gpx></gpx>'], 'vide.gpx', { type: 'application/gpx+xml' }));
    const res = await SELF.fetch(`${base}/courses/${COURSE}/gpx`, { method: 'POST', headers: { Cookie: cookie }, body: fd });
    expect(await res.text()).toContain('GPX illisible');
  });
});

describe('the script draft', () => {
  it('starts empty at the next unpublished version, then saves and estimates', async () => {
    const empty = (await (await get(`/courses/${COURSE}/script`)).json()) as { script: { lines: unknown[]; version: number } };
    expect(empty.script.lines).toEqual([]);
    expect(empty.script.version).toBe(1);
    const saved = await send(`/courses/${COURSE}/script`, TWO_LINES, 'PUT');
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { estimates: { firings: { eventId: string; meters: number; lat: number | null }[] } };
    expect(body.estimates.firings.map((f) => f.eventId)).toEqual(['ceremony.gun', 'course.digue']);
    expect(body.estimates.firings[1]?.meters).toBe(3000);
    expect(body.estimates.firings[1]?.lat).toBeCloseTo(49.365, 2);
    const draft = await scriptDb(env.DB).draft(COURSE);
    expect(draft?.script.lines).toHaveLength(2);
  });

  it('rejects an invalid trigger and a duplicate id without touching the draft', async () => {
    const bad = await send(`/courses/${COURSE}/script`, script([{ ...TWO_LINES.lines[1]!, trigger: { kind: 'somewhere', meters: 10 } as never }]), 'PUT');
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { detail: string }).detail).toContain('trigger');
    const twice = await send(`/courses/${COURSE}/script`, script([TWO_LINES.lines[0]!, TWO_LINES.lines[0]!]), 'PUT');
    expect(twice.status).toBe(400);
    expect((await scriptDb(env.DB).draft(COURSE))?.script.lines).toHaveLength(2);
  });

  it('turns a click on the map into a distance along the course', async () => {
    const res = await send(`/courses/${COURSE}/script/project`, { lat: 49.364, lng: 0.08 });
    expect(res.status).toBe(200);
    const { meters, offsetM } = (await res.json()) as { meters: number; offsetM: number };
    expect(meters).toBeGreaterThan(3000);
    expect(meters).toBeLessThan(6000);
    expect(offsetM).toBeLessThan(5);
  });

  it('estimates elapsed triggers at the requested pace', async () => {
    const res = await get(`/courses/${COURSE}/script?pace=300`);
    const body = (await res.json()) as { estimates: { paceSecPerKm: number } };
    expect(body.estimates.paceSecPerKm).toBe(300);
  });
});

describe('rendering a line', () => {
  it('calls ElevenLabs once, caches the MP3 under its text hash, and serves it back', async () => {
    ttsCalls = [];
    const first = await send(`/courses/${COURSE}/script/render`, { lineId: 'ceremony.gun' });
    expect(first.status).toBe(200);
    const body = (await first.json()) as { hash: string; key: string; bytes: number; cached: boolean; estimates: { lines: { id: string; rendered: boolean }[] } };
    expect(body.cached).toBe(false);
    expect(body.key).toBe(`tts/${body.hash}.mp3`);
    expect(body.bytes).toBe(mp3.length);
    expect(body.estimates.lines.find((l) => l.id === 'ceremony.gun')?.rendered).toBe(true);
    expect(await env.FILES.head(`tts/${body.hash}.mp3`)).not.toBeNull();
    expect(ttsCalls).toHaveLength(1);
    expect(ttsCalls[0]).toContain('/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128');

    // The second render must come from the R2 cache: no new provider call.
    const again = (await (await send(`/courses/${COURSE}/script/render`, { lineId: 'ceremony.gun' })).json()) as { cached: boolean; hash: string };
    expect(again.cached).toBe(true);
    expect(again.hash).toBe(body.hash);
    expect(ttsCalls).toHaveLength(1);

    const audio = await get(`/courses/${COURSE}/audio/${body.hash}`);
    expect(audio.status).toBe(200);
    expect(audio.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(mp3);
    expect((await get(`/courses/${COURSE}/audio/${'0'.repeat(64)}`)).status).toBe(404);
  });

  it('refuses an unknown line', async () => {
    expect((await send(`/courses/${COURSE}/script/render`, { lineId: 'nope' })).status).toBe(404);
  });
});

describe('publishing', () => {
  it('refuses to publish while a line has no voice, and says which', async () => {
    const res = await send(`/courses/${COURSE}/script/publish`, {});
    expect(res.status).toBe(409);
    const body = (await res.json()) as { missing: { id: string; title: string }[] };
    expect(body.missing).toEqual([{ id: 'course.digue', title: 'La digue' }]);
  });

  it('writes the pack, the manifest and the objects, then moves the draft to the next version', async () => {
    await send(`/courses/${COURSE}/script/render`, { lineId: 'course.digue' });
    const res = await send(`/courses/${COURSE}/script/publish`, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ version: 1, files: 2, bytes: mp3.length * 2 });

    const pack = await db(env.DB).latestAudioPack(COURSE);
    expect(pack?.version).toBe(1);
    expect(Object.keys(pack!.files).sort()).toEqual(['digue.mp3', 'gun.mp3']);
    expect(pack!.events.map((e) => e.source)).toEqual([
      { kind: 'file', key: 'gun.mp3' },
      { kind: 'file', key: 'digue.mp3' },
    ]);
    expect(await env.FILES.head(`packs/${COURSE}/1/gun.mp3`)).not.toBeNull();
    const manifest = await env.FILES.get(`packs/${COURSE}/1/manifest.json`);
    expect(AudioPackSchema.parse(await manifest!.json()).version).toBe(1);
    expect((await scriptDb(env.DB).draft(COURSE))?.version).toBe(2);

    // What the app downloads carries no script text, only titles and keys.
    const served = await SELF.fetch(`http://run.test/api/courses/${COURSE}/pack`);
    const text = await served.text();
    expect(text).not.toContain('Vous longez la digue');
    expect(text).not.toContain('"text"');
    expect(JSON.parse(text).events[0].title).toBe('Le départ');
  });

  it('shows the published pack and the new draft version in the studio', async () => {
    const html = await (await get(`/courses/${COURSE}`)).text();
    expect(html).toContain('Publier la version 2');
    expect(html).toContain('Déjà publié : v1');
    expect(html).toContain('La digue');
    // No Mapbox token in the test env: the SVG fallback carries the markers.
    expect(html).toContain('map-fallback');
  });
});
