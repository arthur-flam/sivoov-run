import { SELF, env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AudioPackSchema, PersonalDefsSchema, PersonalVoicesSchema, deauvilleMarathonGeometry } from '@sivoov/shared';
import type { AudioScriptInput, ScriptLineInput } from '@sivoov/shared';
import { db } from '../src/db/queries';
import { adminDb } from '../src/db/adminQueries';
import { scriptDb } from '../src/db/scriptQueries';
import { deauvilleCourses, deauvilleOrganizers, deauvilleRace, deauvilleTestEntrants } from '../src/seed/deauville';

/**
 * The voice of a course and the lines said to each runner, end to end: the organizer picks a
 * voice and writes personal lines in the studio, publishing keeps their definitions privately,
 * the app asks for the runner's own versions before the start and for the live ones as they
 * play. ElevenLabs, Claude and Open-Meteo are stubbed through the shared global fetch.
 */
const SLUG = 'deauville-2026';
const COURSE = `${SLUG}-marathon`;
const base = `http://run.test/org/${SLUG}/courses/${COURSE}`;
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2a]);
const V3 = { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', model: 'eleven_v3' };

const realFetch = globalThis.fetch;
let tts: { voice: string; body: { text: string; model_id: string; language_code?: string } }[] = [];
let claude: { headers: Headers; body: { model: string; fallbacks?: unknown; system: string; messages: { content: string }[] } }[] = [];
let claudeAnswer = 'Camille… non : Léa ! De Rouen jusqu’ici, neuf degrés et de la pluie. Coureurs… à vos marques.';
let elevenStatus = 200;
/** 401: the gateway holds no Anthropic key yet, as when the "sivoov" gateway was first created. */
let claudeStatus = 200;
let workersAi: { url: string; headers: Headers; body: { model: string; messages: { role: string; content: string }[] } }[] = [];
const GATEWAY = 'https://gateway.ai.cloudflare.com/v1/6bd098851f5995454ecdbad6744c567c/sivoov';

let orgCookie = '';
let runnerToken = '';

/** A script line with the defaults filled in; each test says only what matters to it. */
const line = (over: Record<string, unknown>): ScriptLineInput =>
  ({ category: 'course', mix: 'duck', priority: 5, trigger: { kind: 'distance', meters: 1000 }, ...over }) as unknown as ScriptLineInput;

const SCRIPT: Omit<AudioScriptInput, 'courseId' | 'version'> = {
  locale: 'fr',
  voice: V3,
  lines: [
    line({ id: 'ceremony.call', title: 'L’appel', category: 'personal', trigger: { kind: 'cue', at: 'armed', order: 1 }, key: 'call', text: 'Coureurs, sur la ligne.', personal: { kind: 'template', template: 'Dossard {dossard}, {prenom} {nom}, de {ville} !' } }),
    line({ id: 'ceremony.word', title: 'Le mot', category: 'personal', trigger: { kind: 'cue', at: 'armed', order: 2 }, key: 'word', text: 'Où que vous soyez, vous courez avec nous.', personal: { kind: 'ai', prompt: 'Saluez le coureur et dites la météo.' } }),
    line({ id: 'ceremony.gun', title: 'Le départ', category: 'ceremony', trigger: { kind: 'cue', at: 'gun', order: 1 }, key: 'gun', text: '[excited] Partez !' }),
    line({ id: 'personal.split', title: 'Passage', category: 'personal', trigger: { kind: 'split', everyMeters: 5000 }, once: false, key: 'split', text: 'Encore cinq kilomètres.', personal: { kind: 'template', template: 'Kilomètre {km}, {temps}.' } }),
    line({ id: 'ceremony.finish', title: 'L’arrivée', category: 'ceremony', trigger: { kind: 'finish' }, key: 'finish', text: 'Vous êtes arrivé.', personal: { kind: 'template', template: '{prenom}, {temps} !' } }),
  ],
};

beforeAll(async () => {
  const q = db(env.DB);
  await q.upsertRace(deauvilleRace);
  await Promise.all(deauvilleCourses.map((c) => q.upsertCourse(c)));
  await Promise.all(deauvilleOrganizers.map((o) => adminDb(env.DB).upsertOrganizer(o)));
  // Léa runs the marathon and lives in Rouen: {ville} has a value for her.
  await Promise.all(
    deauvilleTestEntrants.map((e) => q.upsertEntrant(e.bib === '1002' ? { ...e, address: { line1: '1 rue du Gros-Horloge', postalCode: '76000', city: 'Rouen', country: 'FR' } } : e)),
  );
  await env.FILES.put('courses/deauville-2026-marathon/geometry.json', JSON.stringify(deauvilleMarathonGeometry));
  await env.DB.prepare('UPDATE courses SET geometry_key = ? WHERE id = ?').bind('courses/deauville-2026-marathon/geometry.json', COURSE).run();

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
    if (url.startsWith('https://api.elevenlabs.io/v2/voices')) {
      return Response.json({ detail: { status: 'missing_permissions', message: 'The API key you used is missing the permission voices_read' } }, { status: 401 });
    }
    if (url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/')) {
      const body = JSON.parse(String(init?.body));
      tts = [...tts, { voice: url.split('/').pop()!.split('?')[0]!, body }];
      return elevenStatus === 200 ? new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } }) : Response.json({ detail: 'voice_not_found' }, { status: elevenStatus });
    }
    if (url.startsWith('https://api.anthropic.com/')) throw new Error('Anthropic must only be reached through the AI Gateway');
    if (url.startsWith(`${GATEWAY}/workers-ai/`)) {
      const request = input instanceof Request ? input : new Request(url, init);
      workersAi = [...workersAi, { url, headers: request.headers, body: await request.clone().json() }];
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'Léa, de Rouen : il pleut chez vous. Coureurs… à vos marques.' } }] });
    }
    if (url.startsWith(`${GATEWAY}/anthropic/`)) {
      const request = input instanceof Request ? input : new Request(url, init);
      claude = [...claude, { headers: request.headers, body: await request.clone().json() }];
      if (claudeStatus !== 200) return Response.json({ type: 'error', error: { type: 'authentication_error', message: 'x-api-key header is required' } }, { status: claudeStatus });
      return Response.json({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [{ type: 'text', text: claudeAnswer }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    }
    if (url.startsWith('https://api.open-meteo.com/')) {
      return Response.json({ current: { temperature_2m: 9.4, wind_speed_10m: 21, weather_code: 61 } });
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

const org = (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') =>
  SELF.fetch(`${base}${path}`, {
    method,
    headers: { Cookie: orgCookie, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const app = (path: string, body: unknown) =>
  SELF.fetch(`http://run.test/api${path}`, { method: 'POST', headers: { Authorization: `Bearer ${runnerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

type LineView = { id: string; source: string; label: string; problems: string[]; personal: { kind: string; phase: string } | null; rendered: boolean };
type Answer = { estimates: { lines: LineView[]; summary: { publish: string; button: { note: string } } } };

describe('the voice of the course', () => {
  it('offers the house voices, and says how to see the account’s own when the key may not read them', async () => {
    const res = await org('/voices');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { house: { id: string; name: string }[]; account: unknown; accountNote: string; models: { id: string }[]; current: { model: string } };
    expect(body.house.map((v) => v.name)).toContain('George');
    expect(body.account).toBeNull();
    expect(body.accountNote).toMatch(/Voices : read/);
    expect(body.models.map((m) => m.id)).toEqual(['eleven_v3', 'eleven_multilingual_v2']);
    // A course with no draft yet starts on v3.
    expect(body.current.model).toBe('eleven_v3');
  });

  it('auditions a voice on the race’s name, tags for v3, and explains a voice the account does not have', async () => {
    tts = [];
    const ok = await org('/voice/sample', { voice: { ...V3, id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' } });
    expect(ok.status).toBe(200);
    expect(tts[0]).toMatchObject({ voice: 'onwK4e9ZLuTAKqWW03F9', body: { model_id: 'eleven_v3', language_code: 'fr' } });
    expect(tts[0]!.body.text).toMatch(/^\[excited\] Bienvenue au Marathon International/);
    const v2 = await org('/voice/sample', { voice: { ...V3, model: 'eleven_multilingual_v2' } });
    expect(v2.status).toBe(200);
    expect(tts[1]!.body.text).not.toMatch(/\[/);
    elevenStatus = 404;
    const unknown = await org('/voice/sample', { voice: { ...V3, id: 'NotAVoiceOfOurs0000' } });
    elevenStatus = 200;
    expect(unknown.status).toBe(502);
    expect(((await unknown.json()) as { detail: string }).detail).toMatch(/My Voices/);
    expect((await org('/voice/sample', { voice: { ...V3, id: 'bad id!' } })).status).toBe(400);
  });
});

describe('personal lines in the studio', () => {
  it('says what a personal line still needs: its offline version, a known field, a value that exists before the start', async () => {
    const draft = {
      ...SCRIPT,
      lines: [
        line({ id: 'a', title: 'Sans hors ligne', key: 'a', text: '', personal: { kind: 'template', template: 'Allez {prenom} !' } }),
        line({ id: 'b', title: 'Faute de frappe', key: 'b', text: 'Allez !', personal: { kind: 'template', template: 'Allez {prenon} !' } }),
        line({ id: 'c', title: 'Trop tôt', key: 'c', trigger: { kind: 'cue', at: 'armed', order: 1 }, text: 'Bonjour.', personal: { kind: 'template', template: 'Déjà {temps} ?' } }),
        line({ id: 'd', title: 'Accolades lues', key: 'd', text: 'Bravo {prenom} !' }),
      ],
    };
    const res = await org('/script', draft, 'PUT');
    expect(res.status).toBe(200);
    const { estimates } = (await res.json()) as Answer;
    const byId = Object.fromEntries(estimates.lines.map((l) => [l.id, l]));
    expect(byId.a).toMatchObject({ label: 'Version hors ligne à écrire', problems: [expect.stringMatching(/version hors ligne/)] });
    expect(byId.b!.problems[0]).toMatch(/\{prenon\} n’existe pas/);
    expect(byId.c!.problems[0]).toMatch(/\{temps\} n’est connu que pendant la course/);
    expect(byId.d!.problems[0]).toMatch(/la voix le lirait tel quel/);
    expect(estimates.summary.publish).toBe('fix');
    const publish = await org('/script/publish', {});
    expect(publish.status).toBe(409);
    expect(((await publish.json()) as { error: string }).error).toBe('to_fix');
  });

  it('reads an older draft’s caption-only template as a personal line waiting for its offline version', async () => {
    const draft = await scriptDb(env.DB).draft(COURSE, 'fr');
    const legacy = { ...draft!.script, lines: [{ ...SCRIPT.lines[3], id: 'old', key: 'old', personal: undefined, slots: ['km', 'splitTime'], text: 'Kilomètre {km}, {splitTime}.' }] };
    await scriptDb(env.DB).saveDraft(legacy as never);
    const res = await org('/script');
    const body = (await res.json()) as Answer & { script: { lines: { personal?: unknown; text: string }[] } };
    expect(body.script.lines[0]).toMatchObject({ personal: { kind: 'template', template: 'Kilomètre {km}, {splitTime}.' }, text: '' });
    expect(body.estimates.lines[0]).toMatchObject({ source: 'personal', personal: { kind: 'template', phase: 'live' }, label: 'Version hors ligne à écrire' });
  });

  it('plays an example as Camille Martin would hear it, and the AI writes one when the line is hers to write', async () => {
    await org('/script', SCRIPT, 'PUT');
    tts = [];
    const template = await org('/script/sample', { lineId: 'ceremony.call' });
    expect(template.status).toBe(200);
    const said = (await template.json()) as { text: string; audioPath: string };
    expect(said.text).toBe('Dossard mille deux cent quarante-sept, Camille Martin, de Lyon !');
    expect(said.audioPath).toMatch(/^\/audio\/[0-9a-f]{64}$/);
    const live = (await (await org('/script/sample', { lineId: 'personal.split' })).json()) as { text: string };
    expect(live.text).toBe('Kilomètre douze, une heure cinq.');
    const finish = (await (await org('/script/sample', { lineId: 'ceremony.finish' })).json()) as { text: string };
    expect(finish.text).toBe('Camille, trois heures, quarante-six minutes et dix-neuf secondes !');
    claude = [];
    const ai = await org('/script/sample', { lineId: 'ceremony.word' });
    expect(ai.status).toBe(200);
    expect(claude[0]!.body.model).toBe('claude-opus-5');
    expect(claude[0]!.body.fallbacks).toBe('default');
    expect(claude[0]!.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    // Through the gateway only, with no Anthropic key: the gateway holds it.
    expect(claude[0]!.headers.get('x-api-key')).toBeNull();
    expect(claude[0]!.headers.get('cf-aig-authorization')).toBe('Bearer test-cf-ai-token');
    expect(((await ai.clone().json()) as { writer: string; note: string }).note).toBe('Écrit par Claude.');
    const asked = claude[0]!.body.messages[0]!.content;
    expect(asked).toContain('Prénom : Camille');
    expect(asked).toContain('neuf degrés, vent de vingt et un kilomètres heure, pluie');
    expect(asked).toContain('Saluez le coureur et dites la météo.');
    expect(claude[0]!.body.system).toMatch(/\[excited\]/);
  });

  it('has Workers AI write on the same gateway while the gateway cannot reach Claude, and says so', async () => {
    claudeStatus = 401;
    workersAi = [];
    const res = await org('/script/sample', { lineId: 'ceremony.word' });
    claudeStatus = 200;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string; writer: string; note: string };
    expect(body).toMatchObject({ text: 'Léa, de Rouen : il pleut chez vous. Coureurs… à vos marques.', writer: 'workers-ai' });
    expect(body.note).toMatch(/Claude n’est pas encore branché sur la passerelle/);
    expect(workersAi[0]!.url).toBe(`${GATEWAY}/workers-ai/v1/chat/completions`);
    expect(workersAi[0]!.body.model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect(workersAi[0]!.headers.get('authorization')).toBe('Bearer test-cf-ai-token');
    expect(workersAi[0]!.body.messages[1]!.content).toContain('Saluez le coureur et dites la météo.');
  });

  it('proposes a text for a line from the race and its neighbours, for the organizer to review', async () => {
    claude = [];
    claudeAnswer = '« [thoughtful] Le Normandy, sur votre droite. »';
    const res = await org('/script/suggest', { lineId: 'personal.split' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ text: '[thoughtful] Le Normandy, sur votre droite.', writer: 'claude' });
    expect(claude[0]!.body.messages[0]!.content).toContain('version hors ligne d’une annonce personnalisée');
    claudeAnswer = 'Léa, de Rouen : neuf degrés et de la pluie chez vous. Coureurs… à vos marques.';
  });

  it('records the offline versions, publishes, and keeps the personal lines out of the public pack', async () => {
    await org('/script', SCRIPT, 'PUT');
    const draft = (await (await org('/script')).json()) as Answer;
    await Promise.all(draft.estimates.lines.filter((l) => !l.rendered).map((l) => org('/script/render', { lineId: l.id })));
    const res = await org('/script/publish', {});
    expect(res.status).toBe(200);
    const { version } = (await res.json()) as { version: number };
    const pack = AudioPackSchema.parse(await (await SELF.fetch(`http://run.test/api/courses/${COURSE}/pack`)).json());
    expect(pack.events.find((e) => e.id === 'ceremony.call')).toMatchObject({ source: { kind: 'file', key: 'call.mp3' }, personal: { phase: 'prepare' } });
    expect(pack.events.find((e) => e.id === 'personal.split')?.personal).toEqual({ phase: 'live' });
    expect(pack.files['split.mp3']).toBeDefined();
    expect(JSON.stringify(pack)).not.toContain('{prenom}');
    // The words are public, as the files say them aloud; how a personal line is made is not.
    expect(pack.events.find((e) => e.id === 'ceremony.call')?.caption).toBeTruthy();
    const defs = PersonalDefsSchema.parse(await (await env.FILES.get(`personal-defs/${COURSE}/${version}.json`))!.json());
    expect(defs.lines.map((d) => [d.eventId, d.phase])).toEqual([
      ['ceremony.call', 'prepare'],
      ['ceremony.word', 'prepare'],
      ['personal.split', 'live'],
      ['ceremony.finish', 'live'],
    ]);
    expect((await SELF.fetch(`http://run.test/api/packs/${COURSE}/${version}/personal.json`)).status).toBe(404);
  });
});

describe('what the app gets for its runner', () => {
  it('renders the runner’s own versions of the lines known before the start, AI included, ready to download', async () => {
    claude = [];
    tts = [];
    const res = await app('/me/voices', { lat: 49.4432, lng: 1.0999 });
    expect(res.status).toBe(200);
    const voices = PersonalVoicesSchema.parse(await res.json());
    expect(Object.keys(voices.files).sort()).toEqual(['ceremony.call', 'ceremony.word']);
    expect(tts.map((t) => t.body.text)).toContain('Dossard mille deux, Léa Martin, de Rouen !');
    expect(voices.captions['ceremony.call']).toBe('Dossard mille deux, Léa Martin, de Rouen !');
    expect(tts.map((t) => t.body.text)).toContain(claudeAnswer);
    expect(claude[0]!.body.messages[0]!.content).toContain('Ville : Rouen');
    const file = await SELF.fetch(voices.files['ceremony.call']!.url.replace(env.BASE_URL, 'http://run.test'));
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('audio/mpeg');
    expect(file.headers.get('cache-control')).toContain('immutable');
  });

  it('keeps what the AI wrote for the runner, so a second visit costs nothing', async () => {
    claude = [];
    tts = [];
    await app('/me/voices', {});
    await app('/me/voices', { lat: 49.4432, lng: 1.0999 });
    expect(claude).toEqual([]);
    expect(tts).toEqual([]);
  });

  it('says a live line with the run’s numbers, and answers 422 when one is missing so the app plays the offline version', async () => {
    const pack = AudioPackSchema.parse(await (await SELF.fetch(`http://run.test/api/courses/${COURSE}/pack`)).json());
    tts = [];
    const split = await app('/me/voices/live', { courseId: COURSE, version: pack.version, eventId: 'personal.split', facts: { km: 5, elapsedS: 1650 } });
    expect(split.status).toBe(200);
    const said = (await split.json()) as { url: string; caption: string };
    expect(said.url).toMatch(/\/api\/voices\/[0-9a-f]{64}\.mp3$/);
    expect(said.caption).toBe('Kilomètre cinq, vingt-sept minutes trente.');
    expect(tts[0]!.body.text).toBe('Kilomètre cinq, vingt-sept minutes trente.');
    const finish = await app('/me/voices/live', { courseId: COURSE, version: pack.version, eventId: 'ceremony.finish', facts: { elapsedS: 13579 } });
    expect(finish.status).toBe(200);
    expect(tts[1]!.body.text).toBe('Léa, trois heures, quarante-six minutes et dix-neuf secondes !');
    expect((await app('/me/voices/live', { courseId: COURSE, version: pack.version, eventId: 'personal.split', facts: { km: 5 } })).status).toBe(422);
    expect((await app('/me/voices/live', { courseId: COURSE, version: pack.version, eventId: 'ceremony.call', facts: {} })).status).toBe(404);
    expect((await app('/me/voices/live', { courseId: `${SLUG}-half`, version: pack.version, eventId: 'personal.split', facts: { km: 5, elapsedS: 1 } })).status).toBe(404);
    expect((await app('/me/voices/live', { courseId: COURSE, version: pack.version, eventId: 'personal.split', facts: { km: 5, elapsedS: -1 } })).status).toBe(400);
  });

  it('needs the runner’s session', async () => {
    const res = await SELF.fetch('http://run.test/api/me/voices', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });
});
