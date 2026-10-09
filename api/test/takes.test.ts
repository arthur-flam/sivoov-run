import { SELF, env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AudioPackSchema, PersonalDefsSchema, PersonalVoicesSchema, pcmToWav } from '@sivoov/shared';
import type { AudioScriptInput, ScriptLineInput } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { adminDb } from '../src/db/adminQueries';
import { sha256HexBytes } from '../src/lib/crypto';
import { deauvilleCourses, deauvilleOrganizers, deauvilleRace, deauvilleTestEntrants } from '../src/seed/deauville';

/**
 * A line said several ways (its takes), end to end: the studio keeps and shows them, records
 * each with the line's own voice (a regular in the crowd, in his own scene), publishing makes
 * each its own file with how long it plays, and the app gets the runner's own version of a take
 * before the start or as it plays. Gemini is stubbed through the shared global fetch.
 */
const SLUG = 'deauville-2026';
const COURSE = `${SLUG}-marathon`;
const base = `http://run.test/org/${SLUG}/courses/${COURSE}`;
const SPEAKER = { id: 'Sadachbia', name: 'Le speaker', model: 'gemini-3.8-flash-tts', direction: 'Le speaker de la course, chaleureux.' };
const FAN = { id: 'Fenrir', direction: 'Un supporter au bord de la route, il crie.', scene: 'Au bord de la route, dans la foule du km 30.' };

/** Half a second of 16-bit PCM at 24 kHz, as Gemini answers: the Worker wraps it in a WAV header. */
const pcm = new Uint8Array(24_000);
/** The organizer's own quarter-second take (a bell), already stored. */
const bell = pcmToWav(new Uint8Array(12_000));

const realFetch = globalThis.fetch;
let said: { voice: string; prompt: string }[] = [];
let orgCookie = '';
let runnerToken = '';
let bellAudio: { kind: 'upload'; hash: string; format: 'wav'; bytes: number; name: string } | null = null;

const line = (over: Record<string, unknown>): ScriptLineInput =>
  ({ category: 'course', mix: 'duck', priority: 5, trigger: { kind: 'distance', meters: 1000 }, ...over }) as unknown as ScriptLineInput;

const script = (): Omit<AudioScriptInput, 'courseId' | 'version'> => ({
  locale: 'fr',
  voice: SPEAKER,
  maxGapS: 120,
  lines: [
    line({ id: 'course.digue', title: 'La digue', trigger: { kind: 'distance', meters: 3000 }, key: 'digue', text: 'Vous longez la digue.' }),
    line({
      id: 'crowd.cheers',
      title: 'La foule',
      category: 'personal',
      trigger: { kind: 'filler' },
      key: 'cheers',
      text: 'Allez, allez !',
      voice: FAN,
      takes: [
        { id: 'a', text: 'Allez, on y va !', personal: { kind: 'template', template: 'Allez {prenom} !' } },
        { id: 'b', text: 'Ça repart !', when: 'restart' },
        { id: 'c', text: '', audio: bellAudio },
      ],
    }),
    line({
      id: 'personal.split',
      title: 'Passage',
      category: 'personal',
      trigger: { kind: 'split', everyMeters: 5000 },
      once: false,
      key: 'split',
      text: 'Encore cinq kilomètres.',
      takes: [{ id: 'b', text: 'Et un de plus.', when: 'steady', personal: { kind: 'template', template: 'Kilomètre {km}, {prenom}, {temps}.' } }],
    }),
  ],
});

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all(deauvilleOrganizers.map((o) => adminDb(env.DB).upsertOrganizer(o)));
  await Promise.all(deauvilleTestEntrants.map((e) => q.upsertEntrant(e)));
  const hash = await sha256HexBytes(bell.buffer as ArrayBuffer);
  await env.FILES.put(`studio-uploads/${hash}.wav`, bell, { httpMetadata: { contentType: 'audio/wav' } });
  bellAudio = { kind: 'upload', hash, format: 'wav', bytes: bell.length, name: 'cloche.wav' };

  const org = await SELF.fetch('http://run.test/org/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ step: 'code', email: 'orga@example.com', code: env.TEST_CODE! }).toString(),
    redirect: 'manual',
  });
  orgCookie = org.headers.get('set-cookie')!.split(';')[0]!;
  const runner = await SELF.fetch('http://run.test/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raceSlug: SLUG, bib: '1002', email: 'lea@example.com', code: '000000' }),
  });
  runnerToken = ((await runner.json()) as { token: string }).token;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/google-ai-studio/') && url.includes(':generateContent')) {
      const body = JSON.parse(String(init?.body)) as {
        contents: { parts: { text: string }[] }[];
        generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } };
      };
      said = [...said, { voice: body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, prompt: body.contents[0]!.parts[0]!.text }];
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: btoa(String.fromCharCode(...pcm)) } }] } }] });
    }
    if (url.startsWith('https://api.open-meteo.com/')) return Response.json({ current: { temperature_2m: 9.4, wind_speed_10m: 21, weather_code: 61 } });
    return realFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

const org = (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') =>
  SELF.fetch(`${base}${path}`, { method, headers: { Cookie: orgCookie, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const app = (path: string, body: unknown) =>
  SELF.fetch(`http://run.test/api${path}`, { method: 'POST', headers: { Authorization: `Bearer ${runnerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
/** The words a render was asked to say: the prompt's transcript. */
const words = (prompt: string) => prompt.split('#### TRANSCRIPT\n')[1]!.trim();

type TakeView = { id: string; name: string; text: string; when: string | null; personal: { label: string; text: string } | null; voiced: boolean; rendered: boolean; audioPath: string | null };
type LineView = { id: string; when: string; moment: string; rendered: boolean; voice: string | null; problems: string[]; takes: TakeView[] };
type Answer = { script: { maxGapS?: number; lines: { id: string; takes?: unknown; voice?: unknown }[] }; estimates: { lines: LineView[] } };

describe('a line said several ways, in the studio', () => {
  it('keeps the takes, the line’s own voice and the quiet limit through a save and a read', async () => {
    const saved = await org('/script', script(), 'PUT');
    expect(saved.status).toBe(200);
    const read = (await (await org('/script')).json()) as Answer;
    expect(read.script.maxGapS).toBe(120);
    const cheers = read.script.lines.find((l) => l.id === 'crowd.cheers')!;
    expect(cheers.voice).toEqual(FAN);
    expect(cheers.takes).toEqual(script().lines[1]!.takes);
    // What the studio sends back on its next autosave is what it read: nothing is lost.
    expect((await org('/script', read.script, 'PUT')).status).toBe(200);
    expect(((await (await org('/script')).json()) as Answer).script).toEqual(read.script);
  });

  it('lists each take under its line, with its condition and its personal version, and the line’s voice', async () => {
    const { estimates } = (await (await org('/script')).json()) as Answer;
    const cheers = estimates.lines.find((l) => l.id === 'crowd.cheers')!;
    expect(cheers).toMatchObject({ when: 'Dans les silences', moment: 'always', voice: 'Voix : Fenrir', rendered: false, problems: [] });
    expect(cheers.takes.map((t) => [t.name, t.text, t.when, t.personal, t.voiced, t.rendered])).toEqual([
      ['Variante a', 'Allez, on y va !', null, { label: 'Personnalisée', text: 'Allez {prenom} !' }, true, false],
      ['Variante b', 'Ça repart !', 'après un arrêt', null, true, false],
      ['Variante c', 'Votre fichier : cloche.wav', null, null, false, true],
    ]);
    expect(cheers.takes[2]!.audioPath).toBe(`/uploads/${bellAudio!.hash}.wav`);
    expect(estimates.lines.find((l) => l.id === 'personal.split')!.takes[0]!.when).toBe('allure tenue');

    const html = await (await org('')).text();
    const from = html.indexOf('data-line="crowd.cheers"');
    const card = html.slice(from, html.indexOf('class="ev" data-line=', from + 1));
    expect(card).toMatch(/<option value="filler" selected[^>]*>Dans les silences de la course</);
    expect(card).toContain('Voix : Fenrir');
    expect(card).toMatch(/class="ev-take" data-take="b"/);
    expect(card).toContain('après un arrêt');
    expect(card).toContain('Allez {prenom} !');
  });

  it('names the take a problem is in', async () => {
    const broken = { ...script(), lines: script().lines.map((l) => (l.id === 'crowd.cheers' ? { ...l, takes: [{ id: 'd', text: 'Bravo {prenom} !' }] } : l)) };
    const { estimates } = (await (await org('/script', broken, 'PUT')).json()) as Answer;
    expect(estimates.lines.find((l) => l.id === 'crowd.cheers')!.problems).toEqual([
      'Variante d : {prenom} dans le texte lu : la voix le lirait tel quel. Les champs vont dans la version personnalisée.',
    ]);
    expect((await org('/script', script(), 'PUT')).status).toBe(200);
  });

  it('refuses a take naming a file the Worker never stored', async () => {
    const lost = { ...script(), lines: script().lines.map((l) => (l.id === 'crowd.cheers' ? { ...l, takes: [{ id: 'c', text: '', audio: { ...bellAudio!, hash: 'd'.repeat(64) } }] } : l)) };
    const refused = await org('/script', lost, 'PUT');
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { detail: string }).detail).toBe('Fichier audio introuvable pour : La foule.');
  });
});

describe('recording and publishing the takes', () => {
  it('refuses to publish while a take has no voice yet, and names it', async () => {
    const res = await org('/script/publish', {});
    expect(res.status).toBe(409);
    const body = (await res.json()) as { detail: string; missing: { id: string; title: string }[] };
    expect(body.missing).toContainEqual({ id: 'crowd.cheers', title: 'La foule (variante b)' });
    expect(body.missing).toContainEqual({ id: 'personal.split', title: 'Passage (variante b)' });
    // The organizer's file is there: it is not asked for.
    expect(body.missing).not.toContainEqual({ id: 'crowd.cheers', title: 'La foule (variante c)' });
    expect(body.detail).toContain('La foule (variante b)');
  });

  it('records a line and every take the voice reads in one go, with the line’s own voice and scene', async () => {
    said = [];
    const res = await org('/script/render', { lineId: 'crowd.cheers' });
    expect(res.status).toBe(200);
    expect(said.map((s) => [s.voice, words(s.prompt)]).sort()).toEqual([
      ['Fenrir', 'Allez, allez !'],
      ['Fenrir', 'Allez, on y va !'],
      ['Fenrir', 'Ça repart !'],
    ]);
    expect(said.every((s) => s.prompt.includes(FAN.scene) && s.prompt.includes(FAN.direction))).toBe(true);
    const { estimates } = (await res.json()) as Answer;
    const cheers = estimates.lines.find((l) => l.id === 'crowd.cheers')!;
    expect(cheers.rendered).toBe(true);
    expect(cheers.takes.every((t) => t.rendered && t.audioPath)).toBe(true);
    // Recorded once: asking again costs nothing.
    said = [];
    await org('/script/render', { lineId: 'crowd.cheers' });
    expect(said).toEqual([]);
  });

  it('publishes each take as its own file, with how long it plays, and the takes in the manifest', async () => {
    await org('/script/render', { lineId: 'course.digue' });
    await org('/script/render', { lineId: 'personal.split' });
    const res = await org('/script/publish', {});
    expect(res.status).toBe(200);
    const { version, files } = (await res.json()) as { version: number; files: number };
    expect(files).toBe(7);
    const pack = AudioPackSchema.parse(await (await SELF.fetch(`http://run.test/api/courses/${COURSE}/pack`)).json());
    expect(pack.maxGapS).toBe(120);
    expect(Object.keys(pack.files).sort()).toEqual(['cheers.wav', 'cheers~a.wav', 'cheers~b.wav', 'cheers~c.wav', 'digue.wav', 'split.wav', 'split~b.wav']);
    // The voice's half second, the organizer's quarter: the rhythm director counts silences with them.
    expect(pack.files['cheers~a.wav']!.seconds).toBe(0.5);
    expect(pack.files['cheers~c.wav']!.seconds).toBe(0.25);
    const cheers = pack.events.find((e) => e.id === 'crowd.cheers')!;
    expect(cheers.trigger).toEqual({ kind: 'filler' });
    expect(cheers.takes).toEqual([
      { id: 'a', key: 'cheers~a.wav', caption: 'Allez, on y va !', personal: { phase: 'prepare' } },
      { id: 'b', key: 'cheers~b.wav', caption: 'Ça repart !', when: 'restart' },
      { id: 'c', key: 'cheers~c.wav' },
    ]);
    const copied = await env.FILES.get(`packs/${COURSE}/${version}/cheers~c.wav`);
    expect(new Uint8Array(await copied!.arrayBuffer())).toEqual(bell);
    // How each take is made stays private: the defs, never the pack.
    expect(JSON.stringify(pack)).not.toContain('{prenom}');
    const defs = PersonalDefsSchema.parse(await (await env.FILES.get(`personal-defs/${COURSE}/${version}.json`))!.json());
    expect(defs.lines.map((d) => [d.eventId, d.takeId, d.phase, d.voice?.id])).toEqual([
      ['crowd.cheers', 'a', 'prepare', 'Fenrir'],
      ['personal.split', 'b', 'live', undefined],
    ]);
  });
});

describe('a take said to the runner', () => {
  it('comes down before the start under its line and take, said by the line’s own voice in its scene', async () => {
    said = [];
    const res = await app('/me/voices', {});
    expect(res.status).toBe(200);
    const voices = PersonalVoicesSchema.parse(await res.json());
    expect(Object.keys(voices.files)).toEqual(['crowd.cheers/a']);
    expect(voices.captions['crowd.cheers/a']).toBe('Allez Léa !');
    expect(said.map((s) => [s.voice, words(s.prompt)])).toEqual([['Fenrir', 'Allez Léa !']]);
    expect(said[0]!.prompt).toContain(FAN.scene);
    expect(voices.files['crowd.cheers/a']!.url).toMatch(/\/api\/voices\/[0-9a-f]{64}\.wav$/);
  });

  it('is said live when the engine chose it, and only that take', async () => {
    const pack = AudioPackSchema.parse(await (await SELF.fetch(`http://run.test/api/courses/${COURSE}/pack`)).json());
    said = [];
    const asked = { courseId: COURSE, version: pack.version, eventId: 'personal.split', facts: { km: 5, elapsedS: 1650 } };
    const res = await app('/me/voices/live', { ...asked, take: 'b' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { caption: string }).caption).toBe('Kilomètre cinq, Léa, vingt-sept minutes trente.');
    expect(said.map((s) => [s.voice, words(s.prompt)])).toEqual([['Sadachbia', 'Kilomètre cinq, Léa, vingt-sept minutes trente.']]);
    // The line's own words are the same for everyone, and a take it does not have is no line at all.
    expect((await app('/me/voices/live', asked)).status).toBe(404);
    expect((await app('/me/voices/live', { ...asked, take: 'z' })).status).toBe(404);
  });
});
