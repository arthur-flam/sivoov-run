import { PersonalDefsSchema, fillTemplate, personalKey, spokenValues, stripAudioTags, supportsAudioTags, voiceFormat, withLineVoice } from '@sivoov/shared';
import type { AudioUploadFormat, Course, LiveFacts, PersonalDef, PersonalDefs, PersonalVoices, Race, RunnerFacts } from '@sivoov/shared';
import { distanceName } from '../pages/org/format';
import { maxCharsFor, writePersonalLine } from './llm';
import type { LlmDeps } from './llm';
import type { PersonalLineBrief } from './prompts/personalLine';
import { VOICES_PREFIX, renderKey, renderText, ttsDepsFor, ttsHash } from './tts';
import type { TtsDeps } from './tts';
import { mapLimit } from './mapLimit';

/**
 * A runner's own versions of the personal lines of a published pack (AUDIO.md, "Personal
 * lines"). Everything here degrades to the line's offline version, which is in the pack: no
 * voice key, no AI key, no town on file, an AI refusal, a network error, each only means that
 * line is said the way everyone hears it.
 * - `prepare` lines (runner facts, AI) are rendered when the app asks, before the start, while
 *   the phone has a network: the app downloads them with the pack.
 * - `live` lines (the run's numbers) are rendered when they play, if the phone has a network.
 * Renders land in `voices/<hash>.mp3`, served by hash (`/api/voices/<hash>.mp3`).
 */
export const DEFS_PREFIX = 'personal-defs/';
export const defsKey = (courseId: string, version: number): string => `${DEFS_PREFIX}${courseId}/${version}.json`;

/** Written next to the pack at publishing: private, the public audio route never serves it. */
export const storeDefs = (files: R2Bucket, defs: PersonalDefs): Promise<R2Object> =>
  files.put(defsKey(defs.courseId, defs.version), JSON.stringify(defs), { httpMetadata: { contentType: 'application/json' } });

export const loadDefs = async (files: R2Bucket, courseId: string, version: number): Promise<PersonalDefs | null> => {
  const object = await files.get(defsKey(courseId, version));
  if (!object) return null;
  const parsed = PersonalDefsSchema.safeParse(await object.json().catch(() => null));
  return parsed.success ? parsed.data : null;
};

export const voiceUrl = (baseUrl: string, hash: string, format: AudioUploadFormat = 'mp3'): string => `${baseUrl}/api/voices/${hash}.${format}`;

export type PersonalDeps = { files: R2Bucket; tts: TtsDeps | null; llm: LlmDeps | null; baseUrl: string };

/** Who the lines are for and where: the AI's facts, and the weather when the app sent a position. */
export type PersonalContext = {
  entrantId: string;
  runner: RunnerFacts;
  race: Race;
  course: Course;
  weather: { runner: string | null; race: string | null };
};

export const runnerFacts = (entrant: { firstName: string; lastName: string; bib: string; distanceKey: RunnerFacts['distanceKey']; address?: { city: string } }): RunnerFacts => ({
  firstName: entrant.firstName,
  lastName: entrant.lastName,
  bib: entrant.bib,
  city: entrant.address?.city ?? null,
  distanceKey: entrant.distanceKey,
});

/** "14 et 15 novembre 2026", or one day. */
export const raceDays = (race: Pick<Race, 'dateStart' | 'dateEnd'>): string => {
  const day = (iso: string, parts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { ...parts, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  if (race.dateStart === race.dateEnd) return day(race.dateStart, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${day(race.dateStart, { day: 'numeric' })} et ${day(race.dateEnd, { day: 'numeric', month: 'long', year: 'numeric' })}`;
};

/** What the AI knows when it writes one line. */
export const briefFor = (def: Pick<PersonalDef, 'title' | 'when' | 'fallback' | 'personal'>, ctx: Omit<PersonalContext, 'entrantId' | 'course'>, tags: boolean): PersonalLineBrief => ({
  prompt: def.personal.kind === 'ai' ? def.personal.prompt : '',
  fallback: def.fallback,
  title: def.title,
  when: def.when,
  race: { name: ctx.race.name, city: ctx.race.city, date: raceDays(ctx.race), distance: distanceName(ctx.runner.distanceKey) },
  runner: { firstName: ctx.runner.firstName, lastName: ctx.runner.lastName, bib: ctx.runner.bib, city: ctx.runner.city },
  weather: ctx.weather,
  tags,
  maxChars: maxCharsFor(def.fallback),
});

/**
 * An AI line is written once per runner and pack version, then kept half a day (the weather
 * moves on), or until the app first sends where the runner is: the race home asks without a
 * position, the pre-flight with one, and the runner's own weather is worth a second writing.
 */
const WRITTEN_FRESH_MS = 12 * 3600 * 1000;
type Written = Record<string, { text: string; at: string; here?: boolean }>;
const writtenKey = (courseId: string, version: number, entrantId: string) => `personal-texts/${courseId}/${version}/${entrantId}.json`;

const readWritten = async (files: R2Bucket, key: string): Promise<Written> => {
  const object = await files.get(key);
  return object ? ((await object.json().catch(() => ({}))) as Written) : {};
};

/** Where a def's runner version is kept, in the answer and in what the AI wrote: `event` or `event/take`. */
const keyOf = (def: Pick<PersonalDef, 'eventId' | 'take'>): string => personalKey(def.eventId, def.take);

/** The sentence one prepare line (or take) becomes for this runner, or null: the offline version plays. */
const prepareText = async (deps: PersonalDeps, defs: PersonalDefs, def: PersonalDef, ctx: PersonalContext, written: Written, now: Date): Promise<string | null> => {
  if (def.personal.kind === 'template') return fillTemplate(def.personal.template, spokenValues(ctx.runner));
  const kept = written[keyOf(def)];
  if (kept && now.getTime() - Date.parse(kept.at) < WRITTEN_FRESH_MS && (kept.here || ctx.weather.runner === null)) return kept.text;
  if (!deps.llm) return null;
  return (await writePersonalLine(deps.llm, briefFor(def, ctx, supportsAudioTags(defs.voice.model))))?.text ?? null;
};

/**
 * A pack may hold a pool of name cheers per runner (« Allez {prenom} ! » a dozen ways): four
 * renders at a time. Each is cached by what is said and who says it, never by runner, so every
 * Camille shares the same cheers and only a new first name costs anything.
 */
const RENDERS_AT_ONCE = 4;

/**
 * The runner's own versions of every `prepare` line of this pack version, and of every take of
 * one, rendered and ready to download, keyed by `personalKey`. Lines that cannot be said to this
 * runner are simply absent.
 */
export const personalVoices = async (deps: PersonalDeps, ctx: PersonalContext, version: number, now: Date = new Date()): Promise<PersonalVoices> => {
  const empty = { courseId: ctx.course.id, version, files: {}, captions: {} };
  const defs = await loadDefs(deps.files, ctx.course.id, version);
  if (!defs || !deps.tts) return empty;
  const prepare = defs.lines.filter((d) => d.phase === 'prepare');
  if (prepare.length === 0) return empty;
  const key = writtenKey(ctx.course.id, version, ctx.entrantId);
  const written = await readWritten(deps.files, key);
  const texts = await mapLimit(prepare, 2, async (def) => ({ def, text: await prepareText(deps, defs, def, ctx, written, now) }));
  const freshAi = texts.filter((t) => t.def.personal.kind === 'ai' && t.text !== null && written[keyOf(t.def)]?.text !== t.text);
  if (freshAi.length > 0) {
    const here = ctx.weather.runner !== null;
    const next = { ...written, ...Object.fromEntries(freshAi.map((t) => [keyOf(t.def), { text: t.text!, at: now.toISOString(), here }])) };
    await deps.files.put(key, JSON.stringify(next), { httpMetadata: { contentType: 'application/json' } });
  }
  const tts = deps.tts;
  // Gemini allows our key ten renders a minute a model: past the first refusal only what is cached
  // is sent, so the answer comes back in time and the app asks again later for the rest. The
  // lines' own versions first (the welcome, the names on the course), then their takes.
  const limited = { hit: false };
  const wanted = texts.filter((t): t is { def: PersonalDef; text: string } => t.text !== null).sort((a, b) => Number(Boolean(a.def.take)) - Number(Boolean(b.def.take)));
  const rendered = await mapLimit(wanted, RENDERS_AT_ONCE, async ({ def, text }) => {
    // The line's own voice keeps its register and scene (a regular in the crowd, the speaker on the PA).
    const outcome = await renderText(tts, withLineVoice(defs.voice, def.voice), text, { prefix: VOICES_PREFIX, locale: defs.locale, cachedOnly: limited.hit });
    if (!outcome.ok && outcome.status === 429) limited.hit = true;
    return { def, text, outcome };
  });
  const said = rendered.flatMap(({ def, text, outcome }) => (outcome.ok ? [{ def, text, rendered: outcome.rendered }] : []));
  const files = Object.fromEntries(said.map(({ def, rendered: r }) => [keyOf(def), { url: voiceUrl(deps.baseUrl, r.hash, r.format), bytes: r.bytes, sha256: r.sha256 }]));
  const captions = Object.fromEntries(said.map(({ def, text }) => [keyOf(def), stripAudioTags(text)]));
  return { ...empty, files, captions };
};

/** Live renders a runner may cause in a day, past the ones already cached: a marathon's splits and a finish, twice over. */
export const LIVE_DAILY_LIMIT = 150;
const quotaKey = (entrantId: string, now: Date) => `voice-quota/${now.toISOString().slice(0, 10)}/${entrantId}.json`;

export type LiveOutcome = { ok: true; url: string; bytes: number; caption: string } | { ok: false; status: 404 | 422 | 429 | 502 | 503; detail: string };

/**
 * One `live` line for this runner at this moment of their run: the line's own personal version,
 * or the take the engine chose (`take`). 422 when a value it needs is missing (the app plays the
 * offline version), 429 past the daily allowance.
 */
export const liveVoice = async (
  deps: PersonalDeps,
  ctx: Pick<PersonalContext, 'entrantId' | 'runner'>,
  line: { courseId: string; version: number; eventId: string; take?: string },
  facts: LiveFacts,
  now: Date = new Date(),
): Promise<LiveOutcome> => {
  if (!deps.tts) return { ok: false, status: 503, detail: 'voice unavailable' };
  const defs = await loadDefs(deps.files, line.courseId, line.version);
  const def = defs?.lines.find((d) => d.eventId === line.eventId && d.take === line.take && d.phase === 'live');
  if (!defs || !def || def.personal.kind !== 'template') return { ok: false, status: 404, detail: 'no such live line' };
  const text = fillTemplate(def.personal.template, spokenValues(ctx.runner, { ...facts, finish: facts.finish ?? def.finish }));
  if (text === null) return { ok: false, status: 422, detail: 'a value is missing' };
  const voice = withLineVoice(defs.voice, def.voice);
  const hash = await ttsHash(voice, text);
  const format = voiceFormat(voice);
  const cached = await deps.files.head(renderKey(voice, hash, VOICES_PREFIX));
  const caption = stripAudioTags(text);
  if (cached) return { ok: true, url: voiceUrl(deps.baseUrl, hash, format), bytes: cached.size, caption };
  const qKey = quotaKey(ctx.entrantId, now);
  const used = ((await (await deps.files.get(qKey))?.json().catch(() => null)) as { n?: number } | null)?.n ?? 0;
  if (used >= LIVE_DAILY_LIMIT) return { ok: false, status: 429, detail: 'daily allowance used' };
  const outcome = await renderText(deps.tts, voice, text, { prefix: VOICES_PREFIX, locale: defs.locale });
  if (!outcome.ok) return { ok: false, status: 502, detail: `tts ${outcome.status}` };
  await deps.files.put(qKey, JSON.stringify({ n: used + 1 }), { httpMetadata: { contentType: 'application/json' } });
  return { ok: true, url: voiceUrl(deps.baseUrl, outcome.rendered.hash, format), bytes: outcome.rendered.bytes, caption };
};

/** The dependencies as this environment has them: no key, no voice or no AI, never an error. */
export const personalDeps = (env: {
  FILES: R2Bucket;
  BASE_URL: string;
  ELEVENLABS_API_TOKEN?: string;
  GEMINI_API_KEY?: string;
  CLOUDFLARE_AI_TOKEN?: string;
  AI_GATEWAY?: string;
  CF_ACCOUNT_ID?: string;
}): PersonalDeps => {
  const tts = ttsDepsFor(env);
  return {
  files: env.FILES,
  baseUrl: env.BASE_URL,
  tts: tts.elevenlabs || tts.gemini ? tts : null,
  llm: env.CLOUDFLARE_AI_TOKEN && env.AI_GATEWAY && env.CF_ACCOUNT_ID ? { token: env.CLOUDFLARE_AI_TOKEN, gateway: env.AI_GATEWAY, accountId: env.CF_ACCOUNT_ID } : null,
  };
};
