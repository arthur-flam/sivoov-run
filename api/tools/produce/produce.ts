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
 * With a target, the files go to that R2 as the organizer's own sounds (`studio-uploads/`) and the
 * draft in D1 points each line and take at them (`audio`, `under`); the draft it replaces is kept in
 * `out/<course>/draft-before-<target>.json`. `--publish` then publishes with the Worker's own code
 * (lib/publish.ts) on the target's bindings (../bindings.ts) and puts the reel up for the race page.
 * Every render's origin is written to `out/<course>/origins.json`.
 * Needs ffmpeg, GEMINI_API_KEY and CLOUDFLARE_ACCOUNT_ID (the repo's .env), and Wrangler logged in.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AudioScriptSchema,
  DemoReelSchema,
  SAMPLE_RUNNER,
  buildScript,
  ceremonySequence,
  fillTemplate,
  hearRun,
  manifestFor,
  spokenValues,
  stripAudioTags,
  takeOf,
  voiceOfLine,
  voicingsOf,
} from '@sivoov/shared';
import type { AudioEvent, AudioPack, AudioScript, BuiltScript, Heard, RunPlan, ScriptLine, ScriptVoice, UploadedAudio } from '@sivoov/shared';
import { champsElyseesCourses, champsElyseesScripts } from '../../src/seed/champsElysees';
import { bindingsFor } from '../bindings';
import type { Target } from '../bindings';
import { db } from '../../src/db/queries';
import { scriptDb } from '../../src/db/scriptQueries';
import { mapLimit } from '../../src/lib/mapLimit';
import { publishScript } from '../../src/lib/publish';
import { reelKey } from '../../src/lib/reel';
import { CACHE, QuotaSpent, source, voice, voiceEnvFromDotenv, voiceOrigin } from './assets';
import { countAlongOf, shoutsOf } from './crowd';
import { durationOf, render } from './mix';
import type { Cut } from './mix';
import { placedOf, playOut, reelOf, runCut, timelineMd } from './run';
import type { Placed, Sounding } from './run';
import { recipesFor, spoken } from './sounds';
import { SOURCES } from './sources';

const [raceId, ...rest] = process.argv.slice(2);
const target = rest.find((a) => ['local', 'preview', 'production'].includes(a)) as Target | undefined;
const flag = (name: string) => rest.includes(`--${name}`);
const onlyCourse = rest.includes('--course') ? rest[rest.indexOf('--course') + 1] : undefined;
if (raceId !== '10km-champs-elysees-2027') throw new Error('usage: produce.ts 10km-champs-elysees-2027 [local|preview|production] [--publish] [--runs] [--course 5k|10k]');

const env = voiceEnvFromDotenv();
/** A voice saying `text`, rendered once and cached (assets.ts keeps where each take came from). */
const say = (v: Pick<ScriptVoice, 'id' | 'name' | 'model' | 'direction' | 'scene'>, text: string): Promise<string> => voice(env, v, text, v.direction ?? '', v.scene);
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Camille Martin, bib 1247, from Lyon: the studio's sample runner, whom every render speaks to. */
const SAMPLE = { ...SAMPLE_RUNNER, distanceKey: '10k' as const };
/** What the AI might write for Camille (the Worker writes it per runner, with the real weather). */
const WORD = 'Neuf degrés et un ciel gris à Lyon, huit sur les Champs-Élysées : le temps idéal. Là où vous courez, la route reste ouverte : gardez un œil dessus. Coureurs… à vos marques.';
/** The runs a listener checks (PRODUCTION.md): 4:30, 5:30 with a stop and a walk, 7:00; the reel is the 5:30 one. */
const runPlans = (targetM: number): { name: string; plan: RunPlan }[] => [
  { name: '4-30', plan: { paceSecPerKm: 270 } },
  { name: '5-30', plan: { paceSecPerKm: 330, stops: [{ atM: targetM * 0.42, seconds: 45 }], walks: [{ atM: targetM * 0.8, seconds: 60 }] } },
  { name: '7-00', plan: { paceSecPerKm: 420 } },
];
const COUNT = ['Dix !', 'Neuf !', 'Huit !', 'Sept !', 'Six !', 'Cinq !', 'Quatre !', 'Trois !', 'Deux !', 'Un !'];

/* ---------- the lines ---------- */

/**
 * Every line's and take's own file, and each line's ambiance: pack file key -> path, with the
 * sources each mix was made of. The countdown is made of its ten numbers (`kit.numbers`), not of
 * its text.
 */
const mixLines = async (built: BuiltScript, out: string) => {
  const countdown = built.lines.find((l) => l.trigger.kind === 'cue' && l.trigger.at === 'countdown')!;
  // The words first, then the countdown's numbers, then the crowd (it makes do with what it has):
  // with a hundred renders a day, what is rendered first is what matters most.
  const toMix = built.lines.flatMap((line) => voicingsOf(line, 'mp3').filter((v) => !v.audio).map((v) => ({ line, v })));
  const voices = await mapLimit(toMix, 4, ({ line, v }) => (line === countdown ? Promise.resolve('') : say(voiceOfLine(built, line), v.text)));
  const numbers = await mapLimit(COUNT, 4, (n) => say(voiceOfLine(built, countdown), n));
  const kit = { src: source, numbers, shouts: await shoutsOf(say), countAlong: await countAlongOf(say) };
  const recipes = await recipesFor(kit);
  const mixes: { key: string; cut: Cut }[] = [
    ...(await Promise.all(toMix.map(async ({ line, v }, i) => ({ key: v.fileKey, cut: await (recipes[line.id]?.bed ?? (async (p: string) => spoken(p)))(voices[i]!) })))),
    ...(await Promise.all(built.lines.flatMap((line) => (recipes[line.id]?.under ? [recipes[line.id]!.under!().then((cut) => ({ key: `${line.key}-under.mp3`, cut }))] : [])))),
  ];
  return Object.fromEntries(
    mixes.map(({ key, cut }) => {
      render(cut, join(out, key));
      return [key, { path: join(out, key), sources: [...new Set(cut.layers.map((l) => l.path))] }];
    }),
  );
};

/** The draft as the studio will hold it, each line and take pointing at its produced file, and the pack the app would get. */
const draftOf = (script: AudioScript, built: BuiltScript, files: Record<string, string>): { draft: AudioScript; pack: AudioPack } => {
  const upload = (key: string, name: string): UploadedAudio => ({ kind: 'upload', hash: sha(files[key]!), format: 'mp3', bytes: statSync(files[key]!).size, name });
  const withSounds = (line: ScriptLine): ScriptLine => {
    const [own, ...takes] = voicingsOf(line, 'mp3');
    const under = `${line.key}-under.mp3`;
    return {
      ...line,
      ...(files[own!.fileKey] ? { audio: upload(own!.fileKey, `${line.key}.mp3 (produit)`) } : {}),
      ...(files[under] ? { under: upload(under, `${line.key}-ambiance.mp3 (produit)`) } : {}),
      ...(line.takes ? { takes: line.takes.map((t, i) => (files[takes[i]!.fileKey] ? { ...t, audio: upload(takes[i]!.fileKey, `${line.key}~${t.id}.mp3 (produit)`) } : t)) } : {}),
    };
  };
  const draft = AudioScriptSchema.parse({ ...script, lines: built.lines.map(withSounds) });
  const pack = manifestFor(
    buildScript(draft),
    Object.entries(files).map(([key, path]) => ({ key, bytes: statSync(path).size, sha256: sha(path), seconds: durationOf(path) })),
  );
  return { draft, pack };
};

/* ---------- the runs ---------- */

/** What the app plays for a line: the runner's own version (said to Camille), else the pack's file. */
const soundingFor =
  (built: BuiltScript, files: Record<string, string>) =>
  async (h: Pick<Heard, 'take' | 'facts'>, event: AudioEvent): Promise<Sounding | null> => {
    const line = built.lines.find((l) => l.id === event.id)!;
    const voicing = voicingsOf(line).find((v) => v.take === h.take)!;
    const personal = voicing.personal;
    const words = personal?.kind === 'template' ? fillTemplate(personal.template, spokenValues(SAMPLE, h.facts)) : personal?.kind === 'ai' ? WORD : null;
    const inPack = (key: string | undefined) => (key ? files[key] : undefined);
    const offline = inPack(takeOf(event, h.take)?.key);
    // No quota left today for Camille's own version: the offline one, as the app would play it.
    const own = words ? await say(voiceOfLine(built, line), words).catch((e: unknown) => (e instanceof QuotaSpent ? null : Promise.reject(e))) : null;
    const file = own ?? offline;
    if (!file) return null;
    const under = inPack(event.under);
    return { file, ...(under ? { under } : {}), words: stripAudioTags(own && words ? words : voicing.text), title: line.title };
  };

/** The start ceremony, back to back, the gun exactly at 0. */
const ceremonyOf = async (pack: AudioPack, sounding: ReturnType<typeof soundingFor>): Promise<Placed[]> => {
  const lines = ceremonySequence(pack)!.lines;
  const sounded = await Promise.all(lines.map(async (event) => ({ event, sounding: (await sounding({ facts: {} }, event))! })));
  const gun = sounded.findIndex((s) => s.event.trigger.kind === 'cue' && s.event.trigger.at === 'gun');
  const lengths = sounded.map((s) => durationOf(s.sounding.file));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return sounded.map((s, i) => ({ at: i < gun ? -sum(lengths.slice(i, gun)) : sum(lengths.slice(gun, i)), event: s.event, sounding: s.sounding, km: 0, filler: false }));
};

/* ---------- one course ---------- */

const produceCourse = async (script: AudioScript, targetM: number) => {
  const out = join(CACHE, 'out', script.courseId);
  mkdirSync(out, { recursive: true });
  const built = buildScript(script);
  console.log(`${script.courseId}: ${built.lines.length} lines`);
  const mixed = await mixLines(built, out);
  const files = Object.fromEntries(Object.entries(mixed).map(([key, m]) => [key, m.path]));
  console.log(`  ${Object.keys(files).length} files`);
  const { draft, pack } = draftOf(script, built, files);

  const sounding = soundingFor(built, files);
  const opening = await ceremonyOf(pack, sounding);
  const t0 = 1 - opening[0]!.at;
  const playlist = await source('playlist');
  const placedFor = async (plan: RunPlan) => [...opening, ...(await placedOf(pack, hearRun(pack, targetM, plan), sounding))];
  const plans = runPlans(targetM);
  const mixRun = (placed: Placed[], file: string, musicFrom: number) => {
    const played = playOut(placed);
    const music = file.replace(/\.mp3$/, '-music.flac');
    render(runCut(played, { t0, playlist, music, musicFrom }), file);
    rmSync(music, { force: true });
    return played;
  };

  if (flag('runs')) {
    for (const { name, plan } of plans) {
      const file = join(out, `run-${name}.mp3`);
      const played = mixRun(await placedFor(plan), file, 0);
      writeFileSync(join(out, `run-${name}.md`), timelineMd(`${script.courseId} at ${name.replace('-', ':')}/km${plan.stops ? ', a stop and a walk' : ''}`, played, t0, 0));
      console.log(`  run ${name}: ${(durationOf(file) / 60).toFixed(1)} min -> ${file}`);
    }
  }

  // The reel: the 5:30 run condensed, with its chapters.
  const reelFile = join(out, 'reel.mp3');
  const reelPlayed = mixRun(reelOf(await placedFor(plans[1]!.plan)), reelFile, 14);
  const mark = (e: AudioEvent) => (e.trigger.kind === 'cue' && e.trigger.at !== 'armed' ? e.trigger.at : e.id === 'ceremony.line' ? 'finish' : undefined);
  const reel = DemoReelSchema.parse({
    courseId: script.courseId,
    duration: Math.round(durationOf(reelFile) * 10) / 10,
    paceSecPerKm: 330,
    chapters: reelPlayed.map((p) => ({ t: Math.round((t0 + p.at) * 10) / 10, title: p.placed.sounding.title, km: Math.round(p.placed.km * 100) / 100, caption: p.placed.sounding.words, ...(mark(p.placed.event) ? { mark: mark(p.placed.event) } : {}) })),
  });
  writeFileSync(join(out, 'reel.json'), JSON.stringify(reel, null, 2));
  console.log(`  reel: ${durationOf(reelFile).toFixed(0)} s, ${reel.chapters.length} chapters -> ${reelFile}`);

  const voices = [...new Set(Object.values(mixed).flatMap((m) => m.sources))].flatMap((path) => {
    const origin = voiceOrigin(path);
    return origin ? [{ file: path, ...origin }] : [];
  });
  writeFileSync(join(out, 'origins.json'), JSON.stringify({ sources: SOURCES, voices, mixes: mixed }, null, 2));
  return { draft, files, reelFile, out };
};

/* ---------- into the studio ---------- */

const produced = [];
for (const script of champsElyseesScripts.filter((s) => !onlyCourse || s.courseId.endsWith(`-${onlyCourse}`))) {
  const course = champsElyseesCourses.find((c) => c.id === script.courseId)!;
  produced.push({ script, ...(await produceCourse(script, course.distanceM)) });
}

if (target) {
  const { env: bindings, dispose } = await bindingsFor(target);
  const scripts = scriptDb(bindings.DB);
  try {
    for (const { script, draft, files, reelFile, out } of produced) {
      const row = await scripts.draft(script.courseId);
      if (!row) throw new Error(`${script.courseId} has no draft on ${target}: seed it first (npm run seed -w api -- ${target} ${raceId})`);
      writeFileSync(join(out, `draft-before-${target}.json`), JSON.stringify(row.script, null, 2));
      for (const path of Object.values(files)) await bindings.FILES.put(`studio-uploads/${sha(path)}.mp3`, readFileSync(path), { httpMetadata: { contentType: 'audio/mpeg' } });
      // The row's version is the next publish's: the draft keeps it.
      const saved = { ...draft, version: row.version };
      await scripts.saveDraft(saved);
      console.log(`${script.courseId}: draft v${row.version} -> ${target} (the one before: ${join(out, `draft-before-${target}.json`)})`);
      if (!flag('publish')) continue;
      const outcome = await publishScript({ db: db(bindings.DB), scripts, files: bindings.FILES }, saved);
      console.log(`${script.courseId}: publish on ${target}: ${JSON.stringify(outcome)}`);
      if (!outcome.ok) {
        process.exitCode = 1;
        continue;
      }
      await bindings.FILES.put(reelKey(script.courseId, 'mp3'), readFileSync(reelFile), { httpMetadata: { contentType: 'audio/mpeg' } });
      await bindings.FILES.put(reelKey(script.courseId, 'json'), readFileSync(reelFile.replace(/\.mp3$/, '.json')), { httpMetadata: { contentType: 'application/json' } });
    }
  } finally {
    await dispose();
  }
}
