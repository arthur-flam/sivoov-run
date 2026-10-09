/**
 * Produces a race's sound, for each of its courses: every line and every take as a file (the
 * voice in its register, mixed with ffmpeg over crowds, the city and music composed for the
 * race; ./sounds.ts), the ambiances under them, a demo reel, and with `--runs` whole runs as a
 * runner would hear them at three paces (./run.ts), with their timelines.
 *
 *   npm run produce -w api -- 10km-champs-elysees-2027                       # mix only, into api/.produce/out/<course>/
 *   npm run produce -w api -- 10km-champs-elysees-2027 --runs                # and the full runs
 *   npm run produce -w api -- 10km-champs-elysees-2027 local|preview|production [--publish] [--course 5k]
 *
 * With a target, the files go to that R2 as the organizer's own sounds (`studio-uploads/`), the
 * draft in D1 points each line and take at them (`audio`, `under`), the reels go to
 * `demo/<courseId>/`, and `--publish` publishes with the Worker's own code (lib/publish.ts) on
 * the target's bindings (../bindings.ts). Every render's origin is written to `origins.json`.
 * Needs ffmpeg, GEMINI_API_KEY and CLOUDFLARE_ACCOUNT_ID (the repo's .env), and Wrangler logged in.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AudioScriptSchema,
  DemoReelSchema,
  SAMPLE_RUNNER,
  buildScript,
  ceremonySequence,
  fileOf,
  fillTemplate,
  hearRun,
  manifestFor,
  spokenValues,
  stripAudioTags,
  voiceOfLine,
  voicingsOf,
} from '@sivoov/shared';
import type { AudioEvent, AudioScript, Heard, RunPlan, ScriptLine, ScriptVoice, UploadedAudio } from '@sivoov/shared';
import { champsElyseesScripts } from '../../src/seed/champsElysees';
import { bindingsFor } from '../bindings';
import type { Target } from '../bindings';
import { db } from '../../src/db/queries';
import { scriptDb } from '../../src/db/scriptQueries';
import { mapLimit } from '../../src/lib/mapLimit';
import { publishScript } from '../../src/lib/publish';
import { CACHE, source, voice, voiceEnvFromDotenv } from './assets';
import { countAlongOf, shoutsOf } from './crowd';
import { durationOf, render } from './mix';
import { placedOf, playOut, reelOf, runCut, timelineMd } from './run';
import type { Placed, Played, Sounding } from './run';
import { recipesFor, spoken } from './sounds';
import { SOURCES } from './sources';

const [raceId, ...rest] = process.argv.slice(2);
const target = rest.find((a) => ['local', 'preview', 'production'].includes(a)) as Target | undefined;
const flag = (name: string) => rest.includes(`--${name}`);
const onlyCourse = rest.includes('--course') ? rest[rest.indexOf('--course') + 1] : undefined;
if (raceId !== '10km-champs-elysees-2027') throw new Error('usage: produce.ts 10km-champs-elysees-2027 [local|preview|production] [--publish] [--runs] [--course 5k|10k]');

const env = voiceEnvFromDotenv();
const scripts = champsElyseesScripts.filter((s) => !onlyCourse || s.courseId.endsWith(`-${onlyCourse}`));

/* ---------- where every sound comes from ---------- */

type Origin =
  | { kind: 'voice'; file: string; provider: 'gemini'; model: string; voice: string; direction: string; scene?: string; text: string; at: string }
  | { kind: 'mix'; file: string; sources: string[] };
const origins: Origin[] = [];
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** A voice saying `text`, rendered once (cached by everything that shapes it) and recorded. */
const say = async (v: Pick<ScriptVoice, 'id' | 'name' | 'model' | 'direction' | 'scene'>, text: string): Promise<string> => {
  const file = await voice(env, { ...v, name: v.name }, text, v.direction ?? '', v.scene);
  if (!origins.some((o) => o.file === file)) origins.push({ kind: 'voice', file, provider: 'gemini', model: v.model, voice: v.id, direction: v.direction ?? '', ...(v.scene ? { scene: v.scene } : {}), text, at: new Date().toISOString() });
  return file;
};

const mixTo = (cut: Parameters<typeof render>[0], out: string): string => {
  render(cut, out);
  origins.push({ kind: 'mix', file: out, sources: [...new Set(cut.layers.map((l) => l.path))] });
  return out;
};

/* ---------- the sample runner the renders speak to ---------- */

/** Camille Martin, bib 1247, from Lyon: the studio's sample runner. */
const SAMPLE = { ...SAMPLE_RUNNER, distanceKey: '10k' as const };
/** What the AI might write for Camille (the Worker writes it per runner, with the real weather). */
const WORD = 'Neuf degrés et un ciel gris à Lyon, huit sur les Champs-Élysées : le temps idéal. Chez vous, la route reste ouverte, gardez un œil dessus. Coureurs… à vos marques.';
/** The runs a listener checks (PRODUCTION.md): 4:30, 5:30 with a stop and a walk, 7:00. */
const runPlans = (targetM: number): { name: string; plan: RunPlan }[] => [
  { name: '4-30', plan: { paceSecPerKm: 270 } },
  { name: '5-30', plan: { paceSecPerKm: 330, stops: [{ atM: targetM * 0.42, seconds: 45 }], walks: [{ atM: targetM * 0.8, seconds: 60 }] } },
  { name: '7-00', plan: { paceSecPerKm: 420 } },
];

const COUNT = ['Dix !', 'Neuf !', 'Huit !', 'Sept !', 'Six !', 'Cinq !', 'Quatre !', 'Trois !', 'Deux !', 'Un !'];

/* ---------- one course ---------- */

const produceCourse = async (script: AudioScript) => {
  const OUT = join(CACHE, 'out', script.courseId);
  mkdirSync(OUT, { recursive: true });
  const built = buildScript(script);
  const lineOf = (id: string) => built.lines.find((l) => l.id === id)!;
  const countdown = built.lines.find((l) => l.trigger.kind === 'cue' && l.trigger.at === 'countdown')!;
  const kit = {
    src: source,
    shouts: await shoutsOf(say),
    countAlong: await countAlongOf(say),
    numbers: await Promise.all(COUNT.map((n) => say(voiceOfLine(built, countdown), n))),
  };
  const recipes = await recipesFor(kit);
  console.log(`${script.courseId}: ${built.lines.length} lines`);
  // Every voice first, four at a time (the mixes below then find them cached).
  const toSay = built.lines.flatMap((line) => (line.id === countdown.id ? [] : voicingsOf(line).filter((v) => !v.audio).map((v) => ({ line, text: v.text }))));
  await mapLimit(toSay, 4, ({ line, text }) => say(voiceOfLine(built, line), text));

  /** Every line's and take's own file, and each line's ambiance: file key in the pack -> path. */
  const files: Record<string, string> = {};
  for (const line of built.lines) {
    const recipe = recipes[line.id] ?? {};
    for (const v of voicingsOf(line, 'mp3')) {
      if (v.audio) continue;
      const voicePath = line.id === countdown.id ? '' : await say(voiceOfLine(built, line), v.text);
      files[v.fileKey] = mixTo(recipe.bed ? await recipe.bed(voicePath) : spoken(voicePath), join(OUT, v.fileKey));
    }
    if (recipe.under) files[`${line.key}-under.mp3`] = mixTo(await recipe.under(), join(OUT, `${line.key}-under.mp3`));
  }
  console.log(`  ${Object.keys(files).length} files`);

  /* The draft as the studio will hold it: each line and take pointing at its produced file. */
  const upload = (key: string, name: string): UploadedAudio => ({ kind: 'upload', hash: sha(files[key]!), format: 'mp3', bytes: statSync(files[key]!).size, name });
  const withSounds = (line: ScriptLine): ScriptLine => {
    const [own, ...takes] = voicingsOf(line, 'mp3');
    return {
      ...line,
      ...(files[own!.fileKey] ? { audio: upload(own!.fileKey, `${line.key}.mp3 (produit)`) } : {}),
      ...(files[`${line.key}-under.mp3`] ? { under: upload(`${line.key}-under.mp3`, `${line.key}-ambiance.mp3 (produit)`) } : {}),
      ...(line.takes ? { takes: line.takes.map((t, i) => (files[takes[i]!.fileKey] ? { ...t, audio: upload(takes[i]!.fileKey, `${line.key}~${t.id}.mp3 (produit)`) } : t)) } : {}),
    };
  };
  const draft: AudioScript = AudioScriptSchema.parse({ ...script, lines: built.lines.map(withSounds) });
  /** The pack the app would get, with the files' real lengths: what the engine plays by. */
  const pack = manifestFor(
    buildScript(draft),
    Object.entries(files).map(([key, path]) => ({ key, bytes: statSync(path).size, sha256: sha(path), seconds: durationOf(path) })),
  );
  const fileFor = (key: string | undefined) => (key ? files[key] : undefined);

  /** What the app plays for a line: the runner's own version (said to Camille), else the pack's file. */
  const soundingOf = async (h: Pick<Heard, 'take' | 'facts'>, event: AudioEvent): Promise<Sounding | null> => {
    const line = lineOf(event.id);
    const voicing = voicingsOf(line).find((v) => v.takeId === h.take)!;
    const personal = voicing.personal;
    const words = personal?.kind === 'template' ? fillTemplate(personal.template, spokenValues(SAMPLE, h.facts)) : personal?.kind === 'ai' ? WORD : null;
    const file = words ? await say(voiceOfLine(built, line), words) : fileFor(fileOf(event, h.take));
    if (!file) return null;
    return { file, ...(fileFor(event.under) ? { under: fileFor(event.under) } : {}), words: stripAudioTags(words ?? voicing.text), title: line.title };
  };

  /** The start ceremony, back to back, the gun at 0. */
  const ceremony = async (): Promise<Placed[]> => {
    const lines = ceremonySequence(pack)!.lines;
    const sounded = await Promise.all(lines.map(async (e) => ({ event: e, sounding: (await soundingOf({ facts: {} }, e))! })));
    const gun = sounded.findIndex((s) => s.event.trigger.kind === 'cue' && s.event.trigger.at === 'gun');
    const before = sounded.slice(0, gun).reduce((t, s) => t + durationOf(s.sounding.file), 0);
    return sounded.reduce<Placed[]>((acc, s) => {
      const at = acc.length === 0 ? -before : acc[acc.length - 1]!.at + durationOf(acc[acc.length - 1]!.sounding.file);
      return [...acc, { at, event: s.event, sounding: s.sounding, km: 0, filler: false }];
    }, []);
  };

  const opening = await ceremony();
  const t0 = 1 - opening[0]!.at;
  const playlist = await source('playlist');
  const runs = flag('runs') ? runPlans(built.courseId.endsWith('-5k') ? 5000 : 10_000) : runPlans(10_000).filter((r) => r.name === '5-30');
  let reelPlaced: Placed[] = [];
  for (const { name, plan } of runs) {
    const targetM = built.courseId.endsWith('-5k') ? 5000 : 10_000;
    const heard = hearRun(pack, targetM, plan);
    const placed = [...opening, ...(await placedOf(pack, heard, soundingOf))];
    if (name === '5-30') reelPlaced = placed;
    if (!flag('runs')) continue;
    const played = playOut(placed);
    const file = join(OUT, `run-${name}.mp3`);
    render(runCut(played, { t0, playlist, music: join(OUT, `run-${name}-music.wav`), musicFrom: 0 }), file);
    writeFileSync(join(OUT, `run-${name}.md`), timelineMd(`${script.courseId} at ${name.replace('-', ':')}/km${plan.stops ? ', a stop and a walk' : ''}`, played, t0, 0));
    console.log(`  run ${name}: ${(durationOf(file) / 60).toFixed(1)} min -> ${file}`);
  }

  /* The reel: the 5:30 run condensed, with its chapters. */
  const reelPlayed: Played[] = playOut(reelOf(reelPlaced));
  const reelFile = join(OUT, 'reel.mp3');
  render(runCut(reelPlayed, { t0, playlist, music: join(OUT, 'reel-music.wav'), musicFrom: 14 }), reelFile);
  const mark = (id: string) => (id === countdown.id ? 'countdown' : id.endsWith('.gun') ? 'gun' : id === 'ceremony.line' ? 'finish' : undefined);
  const reel = DemoReelSchema.parse({
    courseId: script.courseId,
    duration: Math.round(durationOf(reelFile) * 10) / 10,
    paceSecPerKm: 330,
    chapters: reelPlayed.map((p) => ({ t: Math.round((t0 + p.at) * 10) / 10, title: p.placed.sounding.title, km: Math.round(p.placed.km * 100) / 100, caption: p.placed.sounding.words, ...(mark(p.placed.event.id) ? { mark: mark(p.placed.event.id) } : {}) })),
  });
  writeFileSync(join(OUT, 'reel.json'), JSON.stringify(reel, null, 2));
  console.log(`  reel: ${durationOf(reelFile).toFixed(0)} s, ${reel.chapters.length} chapters -> ${reelFile}`);
  writeFileSync(join(OUT, 'origins.json'), JSON.stringify({ sources: SOURCES, renders: origins }, null, 2));
  return { draft, files, reelFile };
};

/* ---------- into the studio ---------- */

const produced = [];
for (const script of scripts) produced.push({ script, ...(await produceCourse(script)) });

if (target) {
  const { env: bindings, dispose } = await bindingsFor(target);
  const scriptsDb = scriptDb(bindings.DB);
  try {
    for (const { script, draft, files, reelFile } of produced) {
      const row = await scriptsDb.draft(script.courseId);
      if (!row) throw new Error(`${script.courseId} has no draft on ${target}: seed it first (npm run seed -w api -- ${target} ${raceId})`);
      for (const path of Object.values(files)) await bindings.FILES.put(`studio-uploads/${sha(path)}.mp3`, readFileSync(path), { httpMetadata: { contentType: 'audio/mpeg' } });
      // The row's version is the next publish's; the draft takes it over, published mark and all.
      const saved = { ...draft, version: row.version };
      await scriptsDb.saveDraft(saved);
      await bindings.FILES.put(`demo/${script.courseId}/reel.mp3`, readFileSync(reelFile), { httpMetadata: { contentType: 'audio/mpeg' } });
      await bindings.FILES.put(`demo/${script.courseId}/reel.json`, readFileSync(reelFile.replace(/\.mp3$/, '.json')), { httpMetadata: { contentType: 'application/json' } });
      console.log(`${script.courseId}: draft v${row.version} and reel -> ${target}`);
      if (flag('publish')) {
        const outcome = await publishScript({ db: db(bindings.DB), scripts: scriptsDb, files: bindings.FILES }, saved);
        console.log(`${script.courseId}: publish on ${target}: ${JSON.stringify(outcome)}`);
      }
    }
  } finally {
    await dispose();
  }
}
