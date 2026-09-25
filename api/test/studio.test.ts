import { SELF, env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AudioPackSchema, buildTrack, deauvilleMarathonGeometry } from '@sivoov/shared';
import type { AudioScriptInput } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { sha256HexBytes } from '../src/lib/crypto';
import { adminDb } from '../src/db/adminQueries';
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
  await Promise.all(deauvilleOrganizers.map((o) => adminDb(env.DB).upsertOrganizer(o)));
  // The seeded marathon's trace, as `npm run seed` puts it in R2.
  await env.FILES.put('courses/deauville-2026-marathon.json', JSON.stringify(deauvilleMarathonGeometry), {
    httpMetadata: { contentType: 'application/json' },
  });
  const res = await SELF.fetch('http://run.test/org/signin', {
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
  it('needs a session, then says in plain words where each distance stands and what to do next', async () => {
    expect((await SELF.fetch(`${base}/courses`, { redirect: 'manual' })).status).toBe(302);
    const html = await (await get('/courses')).text();
    expect(html).toContain('Parcours et annonces');
    expect(html).toContain('Marathon');
    // The seeded marathon has a trace in R2 (42,4 km measured), matching its official distance.
    expect(html).toContain('Tracé importé');
    expect(html).toContain('42,41 km mesurés pour 42,195 km officiels');
    // The half points at the same file: 42,4 km for 21,1 km is flagged, not accepted.
    expect(html).toContain('Tracé à vérifier');
    expect(html).toContain('Le tracé mesure 42,41 km pour 21,098 km officiels. Vérifiez que c’est le bon fichier.');
    expect(html).toContain('Pas encore d’annonce');
    expect(html).toContain('Pas encore publiées');
    expect(html).toContain('Écrire les annonces');
    expect(html).toContain('Un fichier GPX décrit le parcours point par point');
    expect(html).toContain('Ajouter une distance');
  });

  it('creates a course and refuses a second one on the same distance', async () => {
    const form = (fields: Record<string, string>) =>
      SELF.fetch(`${base}/courses`, {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
        redirect: 'manual',
      });
    // The official distance is typed in km with a decimal comma; a typo is shown back with the typed value.
    const typo = await form({ distanceKey: '10k', distanceKm: 'dix' });
    expect(typo.status).toBe(400);
    const typoHtml = await typo.text();
    expect(typoHtml).toContain('Écrivez la distance en kilomètres');
    expect(typoHtml).toContain('value="dix"');
    const created = await form({ distanceKey: '10k', distanceKm: '10' });
    expect(created.status).toBe(302);
    expect(created.headers.get('location')).toBe(`/org/${SLUG}/courses/${COURSE}`);
    const course = await db(env.DB).courseById(COURSE);
    expect(course?.distanceM).toBe(10_000);
    expect(course?.geometryKey).toBeUndefined();
    expect(await (await form({ distanceKey: '10k', distanceKm: '10' })).text()).toContain('déjà un parcours');
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
    expect(measured).toBeGreaterThan(1000);
    // Back to the courses page, where the card compares the measured length with the official one.
    expect(res.headers.get('location')).toBe(`/org/${SLUG}/courses?done=gpx#${COURSE}`);
    const html = await (await get('/courses?done=gpx')).text();
    expect(html).toContain('Tracé importé. Vérifiez sa longueur ci-dessous.');
  });

  it('refuses a GPX with no track points', async () => {
    const fd = new FormData();
    fd.append('gpx', new File(['<gpx></gpx>'], 'vide.gpx', { type: 'application/gpx+xml' }));
    const res = await SELF.fetch(`${base}/courses/${COURSE}/gpx`, { method: 'POST', headers: { Cookie: cookie }, body: fd });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('Ce fichier ne contient pas de tracé lisible');
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

  it('shows in the studio that runners have this version, in plain words', async () => {
    const html = await (await get(`/courses/${COURSE}`)).text();
    expect(html).toContain('2 annonces · dernière publication le');
    expect(html).toContain('Les coureurs ont cette version depuis le');
    expect(html).toContain('La digue');
    expect(html).toContain('Au km 3');
    expect(html).toContain('Voix prête');
    // Nothing changed since: the publish button is there, and says there is nothing to send.
    expect(html).toMatch(/data-role="publish" disabled="">Publié</);
  });

  it('remembers what it published, and the studio cannot overwrite that', async () => {
    const draft = await scriptDb(env.DB).draft(COURSE);
    expect(draft?.script.published).toMatchObject({ version: 1 });
    const saved = await send(`/courses/${COURSE}/script`, { ...TWO_LINES, published: { version: 9, at: '2020-01-01T00:00:00Z', fingerprint: 'forged' } }, 'PUT');
    const body = (await saved.json()) as { script: { published: { version: number; fingerprint: string } }; estimates: { summary: { changed: boolean } } };
    expect(body.script.published.version).toBe(1);
    expect(body.script.published.fingerprint).toBe(draft?.script.published?.fingerprint);
    // The same lines as published: nothing to publish.
    expect(body.estimates.summary.changed).toBe(false);
  });

  it('falls back to the SVG diagram with ?map=svg, whatever the Mapbox token', async () => {
    const html = await (await get(`/courses/${COURSE}?map=svg`)).text();
    expect(html).not.toContain('id="studio-map"');
    expect(html).toContain('class="map-fallback"');
    expect(html).toContain('Tracé schématique');
    // The same events, as dots on the diagram.
    expect(html).toContain('data-event="course.digue"');
  });
});

/** A short "MP3": an ID3 header, then bytes of its own so its hash differs from the stubbed voice. */
const bell = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2a, 0x62, 0x65, 0x6c, 0x6c]);
/** The smallest WAV header the Worker recognises. */
const wav = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0x24, 0x08, 0, 0], [...'WAVEfmt '].map((c) => c.charCodeAt(0)), [0x10, 0, 0, 0]));

const uploadTo = (lineId: string, bytes: Uint8Array, name: string) => {
  const fd = new FormData();
  fd.append('file', new File([bytes], name));
  return SELF.fetch(`${base}/courses/${COURSE}/script/lines/${lineId}/audio`, { method: 'POST', headers: { Cookie: cookie, Accept: 'application/json' }, body: fd });
};

type LineView = { id: string; source: string; rendered: boolean; label: string; audioPath: string | null };
type Answer = {
  script: { lines: { id: string; audio?: { kind: string; hash: string; format: string; bytes: number; name: string } }[] };
  estimates: { lines: LineView[]; summary: { changed: boolean; publish: string; text: string } };
};

describe('the organizer’s own sound file', () => {
  it('puts an uploaded MP3 on a line, stored once by its content, and plays it back', async () => {
    const res = await uploadTo('course.digue', bell, 'cloche.mp3');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Answer;
    const hash = await sha256HexBytes(bell.buffer as ArrayBuffer);
    expect(body.script.lines.find((l) => l.id === 'course.digue')?.audio).toEqual({ kind: 'upload', hash, format: 'mp3', bytes: bell.length, name: 'cloche.mp3' });
    expect(await env.FILES.head(`studio-uploads/${hash}.mp3`)).not.toBeNull();
    const status = body.estimates.lines.find((l) => l.id === 'course.digue');
    expect(status).toMatchObject({ source: 'upload', rendered: true, label: 'Fichier audio', audioPath: `/uploads/${hash}.mp3` });
    // A change runners do not have yet, and nothing left to record: it can go out.
    expect(body.estimates.summary).toMatchObject({ changed: true, publish: 'ready' });
    expect((await scriptDb(env.DB).draft(COURSE))?.script.lines.find((l) => l.id === 'course.digue')?.audio?.hash).toBe(hash);

    const played = await get(`/courses/${COURSE}/uploads/${hash}.mp3`);
    expect(played.status).toBe(200);
    expect(played.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(played.headers.get('Cache-Control')).toContain('private');
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(bell);
  });

  it('refuses a file that is not a sound, and one over 5 MB', async () => {
    const text = await uploadTo('course.digue', new TextEncoder().encode('<html>pas un son</html>'), 'cloche.mp3');
    expect(text.status).toBe(415);
    expect(((await text.json()) as { detail: string }).detail).toBe('Ce fichier n’est pas un son MP3, M4A ou WAV.');
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(bell);
    const tooBig = await uploadTo('course.digue', big, 'long.mp3');
    expect(tooBig.status).toBe(413);
    expect(((await tooBig.json()) as { detail: string }).detail).toContain('5 Mo');
    expect((await uploadTo('nope', bell, 'cloche.mp3')).status).toBe(404);
  });

  it('does not record the voice for a line that plays a file', async () => {
    const res = await send(`/courses/${COURSE}/script/render`, { lineId: 'course.digue' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { detail: string }).detail).toContain('Revenez à la voix');
  });

  it('keeps the file when the whole script is saved again, and refuses a file the Worker never stored', async () => {
    const current = (await (await get(`/courses/${COURSE}/script`)).json()) as { script: Answer['script'] & Record<string, unknown> };
    const again = (await (await send(`/courses/${COURSE}/script`, current.script, 'PUT')).json()) as Answer;
    expect(again.script.lines.find((l) => l.id === 'course.digue')?.audio?.name).toBe('cloche.mp3');
    const forged = {
      ...current.script,
      lines: current.script.lines.map((l) => (l.id === 'ceremony.gun' ? { ...l, audio: { kind: 'upload', hash: 'b'.repeat(64), format: 'mp3', bytes: 10, name: 'x.mp3' } } : l)),
    };
    const refused = await send(`/courses/${COURSE}/script`, forged, 'PUT');
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { detail: string }).detail).toBe('Fichier audio introuvable pour : Le départ.');
  });

  it('publishes the uploaded bytes instead of a voice, without calling ElevenLabs', async () => {
    ttsCalls = [];
    const res = await send(`/courses/${COURSE}/script/publish`, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ version: 2, files: 2, bytes: mp3.length + bell.length });
    expect(ttsCalls).toHaveLength(0);

    const pack = await db(env.DB).latestAudioPack(COURSE);
    expect(pack?.version).toBe(2);
    // The pack format is the one the app knows: a file event, a file entry with its sha256.
    expect(pack!.events.find((e) => e.id === 'course.digue')?.source).toEqual({ kind: 'file', key: 'digue.mp3' });
    expect(pack!.files['digue.mp3']).toMatchObject({ bytes: bell.length, sha256: await sha256HexBytes(bell.buffer as ArrayBuffer) });
    const object = await env.FILES.get(`packs/${COURSE}/2/digue.mp3`);
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(bell);
    const served = await SELF.fetch(`http://run.test/api/courses/${COURSE}/pack`);
    const text = await served.text();
    expect(AudioPackSchema.safeParse(JSON.parse(text)).success).toBe(true);
    expect(text).not.toContain('studio-uploads');
    expect(text).not.toContain('cloche.mp3');
  });

  it('keeps a WAV file’s format in the pack', async () => {
    expect((await uploadTo('ceremony.gun', wav, 'pistolet.wav')).status).toBe(200);
    const res = await send(`/courses/${COURSE}/script/publish`, {});
    expect(res.status).toBe(200);
    const pack = await db(env.DB).latestAudioPack(COURSE);
    expect(pack!.events.find((e) => e.id === 'ceremony.gun')?.source).toEqual({ kind: 'file', key: 'gun.wav' });
    const object = await env.FILES.get(`packs/${COURSE}/3/gun.wav`);
    expect(object?.httpMetadata?.contentType).toBe('audio/wav');
  });

  it('returns a line to the voice when its file is removed', async () => {
    const res = await SELF.fetch(`${base}/courses/${COURSE}/script/lines/course.digue/audio`, { method: 'DELETE', headers: { Cookie: cookie, Accept: 'application/json' } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Answer;
    expect(body.script.lines.find((l) => l.id === 'course.digue')?.audio).toBeUndefined();
    // Its text was recorded earlier, so the voice is ready again at once.
    expect(body.estimates.lines.find((l) => l.id === 'course.digue')).toMatchObject({ source: 'voice', rendered: true, label: 'Voix prête' });
    expect(body.estimates.summary).toMatchObject({ changed: true, publish: 'ready' });
    expect((await scriptDb(env.DB).draft(COURSE))?.script.lines.find((l) => l.id === 'course.digue')?.audio).toBeUndefined();
  });
});

describe('what the courses page says after publishing', () => {
  it('offers to publish the changes from the card, then says runners have them', async () => {
    const before = await (await get('/courses')).text();
    expect(before).toContain('Des changements ne sont pas encore publiés');
    expect(before).toContain('Publier les changements');
    const res = await SELF.fetch(`${base}/courses/${COURSE}/publish`, { method: 'POST', headers: { Cookie: cookie }, redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/org/${SLUG}/courses?done=published#${COURSE}`);
    expect((await db(env.DB).latestAudioPack(COURSE))?.version).toBe(4);
    const after = await (await get('/courses?done=published')).text();
    expect(after).toContain('Annonces publiées. Les coureurs les reçoivent la prochaine fois qu’ils ouvrent l’application.');
    expect(after).toMatch(/Publiées le \d{1,2} [^,]+, les coureurs les ont/);
    expect(after).toContain('2 annonces, toutes prêtes');
  });
});

describe('a viewer', () => {
  let viewer = '';
  beforeAll(async () => {
    const res = await SELF.fetch('http://run.test/org/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ step: 'code', email: 'lecture@example.com', code: env.TEST_CODE! }).toString(),
      redirect: 'manual',
    });
    viewer = res.headers.get('set-cookie')!.split(';')[0]!;
  });
  const as = (path: string, init: RequestInit = {}) =>
    SELF.fetch(`${base}${path}`, { ...init, headers: { Cookie: viewer, Accept: 'application/json', ...((init.headers as Record<string, string>) ?? {}) }, redirect: 'manual' });

  it('sees the studio read-only and can listen', async () => {
    const res = await SELF.fetch(`${base}/courses/${COURSE}`, { headers: { Cookie: viewer } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Lecture seule');
    expect(html).toContain('data-role="listen"');
    expect(html).not.toMatch(/<button[^>]*data-role="publish"/);
    expect(html).not.toMatch(/<button[^>]*data-role="add"/);
    expect(html).not.toMatch(/<button[^>]*data-role="delete"/);
    expect(html).not.toContain('Utiliser un fichier audio');
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
    expect((await as(`/courses/${COURSE}/script`)).status).toBe(200);
    const courses = await (await SELF.fetch(`${base}/courses`, { headers: { Cookie: viewer } })).text();
    expect(courses).toContain('Voir et écouter les annonces');
    expect(courses).not.toContain('Ajouter une distance');
    expect(courses).not.toContain('name="gpx"');
  });

  it('cannot write the script, record a voice, add or remove a file, or publish', async () => {
    const json = { 'Content-Type': 'application/json' };
    const before = await scriptDb(env.DB).draft(COURSE);
    expect((await as(`/courses/${COURSE}/script`, { method: 'PUT', headers: json, body: JSON.stringify(TWO_LINES) })).status).toBe(403);
    expect((await as(`/courses/${COURSE}/script/render`, { method: 'POST', headers: json, body: JSON.stringify({ lineId: 'ceremony.gun' }) })).status).toBe(403);
    const fd = new FormData();
    fd.append('file', new File([bell], 'cloche.mp3'));
    expect((await as(`/courses/${COURSE}/script/lines/course.digue/audio`, { method: 'POST', body: fd })).status).toBe(403);
    expect((await as(`/courses/${COURSE}/script/lines/ceremony.gun/audio`, { method: 'DELETE' })).status).toBe(403);
    expect((await as(`/courses/${COURSE}/script/publish`, { method: 'POST', headers: json, body: '{}' })).status).toBe(403);
    // The page forms send them back to the race home with a note.
    const form = await SELF.fetch(`${base}/courses/${COURSE}/publish`, { method: 'POST', headers: { Cookie: viewer }, redirect: 'manual' });
    expect(form.headers.get('location')).toBe(`/org/${SLUG}?denied=1`);
    expect((await scriptDb(env.DB).draft(COURSE))?.updatedAt).toBe(before?.updatedAt);
    expect((await db(env.DB).latestAudioPack(COURSE))?.version).toBe(4);
  });
});
