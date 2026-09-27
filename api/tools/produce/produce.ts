/**
 * Produces a race's sound: every line's file and ambiance (./champsElysees.ts), mixed with
 * ffmpeg from the voice (Gemini, through the AI Gateway), crowds, the city and music composed
 * for the race, plus a demo reel (the whole race in about four minutes, with chapters) for the
 * race page and for listening without running.
 *
 *   npm run produce -w api -- 10km-champs-elysees-2027                      # mix only, into api/.produce/out/
 *   npm run produce -w api -- 10km-champs-elysees-2027 local|preview|production [--publish]
 *
 * With a target, the files go to R2 as the organizer's own sounds (`studio-uploads/`), the
 * draft in D1 points each line at them (`audio`, `under`), the reel goes to `demo/<courseId>/`,
 * and `--publish` asks that Worker to publish (local and preview, with the test organizer; on
 * production, press « Publier » in the studio). Needs ffmpeg, GEMINI_API_KEY and
 * CLOUDFLARE_ACCOUNT_ID (the repo's .env).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AudioScriptSchema, DemoReelSchema, UploadedAudioSchema, fillTemplate, spokenValues } from '@sivoov/shared';
import type { AudioScript, UploadedAudio } from '@sivoov/shared';
import { champsElyseesScripts } from '../../src/seed/champsElysees';
import { API_DIR, CACHE, source, voice } from './assets';
import { MOODS, produceChampsElysees } from './champsElysees';
import type { Mood } from './champsElysees';
import { durationOf, render } from './mix';
import type { Cut, Layer } from './mix';

const [raceId, target, ...flags] = process.argv.slice(2);
if (raceId !== '10km-champs-elysees-2027') throw new Error('usage: produce.ts 10km-champs-elysees-2027 [local|preview|production] [--publish]');
if (target && !['local', 'preview', 'production'].includes(target)) throw new Error(`unknown target ${target}`);
const publish = flags.includes('--publish');

const dotenv = Object.fromEntries(
  (existsSync(join(API_DIR, '../.env')) ? readFileSync(join(API_DIR, '../.env'), 'utf8') : '')
    .split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [m[1]!, m[2]!.replace(/^["']|["']$/g, '')]),
);
const env = (k: string) => process.env[k] ?? dotenv[k] ?? '';
const voiceEnv = { geminiKey: env('GEMINI_API_KEY'), gateway: `https://gateway.ai.cloudflare.com/v1/${env('CLOUDFLARE_ACCOUNT_ID')}/sivoov` };
if (!voiceEnv.geminiKey || !env('CLOUDFLARE_ACCOUNT_ID')) throw new Error('GEMINI_API_KEY and CLOUDFLARE_ACCOUNT_ID are needed');

const script = champsElyseesScripts[0]!;
const direction = script.voice.direction ?? '';
const OUT = join(CACHE, 'out', script.courseId);
mkdirSync(OUT, { recursive: true });

/**
 * The speaker in a mood. In the runner's ears (`ear`) the prompt is exactly the Worker's for a
 * personal line, so the produced lines and the runner's own ones sound like one voice.
 */
const say = (text: string, mood: Mood, take = 1) =>
  mood === 'ear' ? voice(voiceEnv, script.voice, text, direction, undefined, take) : voice(voiceEnv, script.voice, text, `${direction} ${MOODS[mood].style}`, MOODS[mood].scene, take);
/** What the Worker would say to a runner: the script's own direction, no mood. */
const sayPersonal = (text: string) => voice(voiceEnv, script.voice, text, direction);

console.log(`producing ${script.courseId}: ${script.lines.length} lines`);
const productions = await produceChampsElysees(script.lines, { src: source, say });

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const mixed = Object.fromEntries(
  Object.entries(productions).map(([id, p]) => {
    const key = script.lines.find((l) => l.id === id)!.key;
    const files = { file: p.file && join(OUT, `${key}.mp3`), under: p.under && join(OUT, `${key}-under.mp3`) };
    if (p.file) render(p.file, files.file!);
    if (p.under) render(p.under, files.under!);
    console.log(`  ${id}: ${[files.file, files.under].filter(Boolean).map((f) => `${f!.split('/').pop()} ${durationOf(f!).toFixed(1)} s`).join(', ')}`);
    return [id, files];
  }),
) as Record<string, { file?: string; under?: string }>;

/* ---------- the demo reel ---------- */

/** Camille Martin, bib 1247, from Lyon: the studio's sample runner, running 47:12. */
const SAMPLE = { firstName: 'Camille', lastName: 'Martin', bib: '1247', city: 'Lyon', distanceKey: '10k' as const };
const personal = async (id: string, live: Parameters<typeof spokenValues>[1] = {}) => {
  const l = script.lines.find((x) => x.id === id)!;
  const text = l.personal?.kind === 'template' ? fillTemplate(l.personal.template, spokenValues(SAMPLE, live)) : null;
  return sayPersonal(text ?? l.text);
};
/** What the AI might write for Camille (the Worker writes it per runner with the real weather). */
const WORD =
  'Camille, bonjour ! Neuf degrés et un ciel gris à Lyon, huit sur les Champs-Élysées : le temps idéal pour courir. Coureurs… à vos marques.';

type Chapter = { title: string; km: number; caption: string; mark?: 'countdown' | 'gun' | 'finish' };
type Step = { file?: string; under?: string; hold?: number; gap?: number; chapter?: Chapter };
const cap = (id: string) => script.lines.find((l) => l.id === id)!;
const at = (id: string, km: number, caption?: string, mark?: Chapter['mark']): Chapter => ({ title: cap(id).title, km, caption: caption ?? cap(id).text, ...(mark ? { mark } : {}) });

const steps: Step[] = [
  { under: mixed['ceremony.welcome']!.under, hold: 2.5, chapter: { title: 'Le village de départ', km: 0, caption: 'La foule, la musique du village, le speaker sur la sono.' } },
  { file: mixed['ceremony.welcome']!.file, chapter: at('ceremony.welcome', 0) },
  { file: mixed['ceremony.safety']!.file, chapter: at('ceremony.safety', 0) },
  { file: await personal('ceremony.call'), chapter: at('ceremony.call', 0, 'Dossard mille deux cent quarante-sept… Camille Martin ! Bienvenue sur les Champs-Élysées. On vous attend dans le sas !') },
  { file: await sayPersonal(WORD), chapter: at('ceremony.word', 0, WORD) },
  { file: mixed['ceremony.countdown']!.file, under: mixed['ceremony.countdown']!.under, gap: 0, chapter: at('ceremony.countdown', 0, undefined, 'countdown') },
  { file: mixed['ceremony.gun']!.file, under: mixed['ceremony.gun']!.under, hold: 14, chapter: at('ceremony.gun', 0, 'Partez ! Le chrono part au coup de corne.', 'gun') },
  { under: 'stop', hold: 1.2 },
  { file: mixed['course.concorde']!.file, gap: 2, chapter: at('course.concorde', 0.3) },
  { file: await personal('personal.split', { km: 1, elapsedS: 298 }), gap: 2, chapter: { title: 'Kilomètre 1', km: 1, caption: 'Kilomètre un. Quatre minutes cinquante-huit.' } },
  { file: mixed['course.monceau']!.file, gap: 2, chapter: at('course.monceau', 2.1) },
  { file: mixed['course.half']!.file, gap: 0.3, chapter: at('course.half', 5) },
  { file: await personal('personal.split', { km: 5, elapsedS: 1432 }), gap: 2, chapter: { title: 'Kilomètre 5', km: 5, caption: 'Kilomètre cinq. Vingt-trois minutes cinquante-deux.' } },
  { file: mixed['course.rond-point']!.file, under: mixed['course.rond-point']!.under, hold: 12, chapter: at('course.rond-point', 5.95) },
  { file: mixed['course.arc']!.file, under: mixed['course.arc']!.under, hold: 16, chapter: at('course.arc', 6.9) },
  { under: 'stop', hold: 1.5 },
  { file: mixed['course.alma']!.file, gap: 2, chapter: at('course.alma', 8.6) },
  { file: mixed['course.golden']!.file, under: mixed['course.golden']!.under, hold: 14, chapter: at('course.golden', 9) },
  { file: mixed['course.final']!.file, under: mixed['course.final']!.under, hold: 3, chapter: at('course.final', 9.8) },
  { file: mixed['ceremony.line']!.file, gap: 0.2, chapter: at('ceremony.line', 10, undefined, 'finish') },
  {
    file: await personal('ceremony.finish', { elapsedS: 2832, finish: true }),
    under: mixed['ceremony.finish']!.under,
    hold: 30,
    chapter: at('ceremony.finish', 10, 'Camille Martin ! Quarante-sept minutes et douze secondes ! Vous avez bouclé le 10 km des Champs-Élysées !'),
  },
];

const FADE = 0.8;
const reelLayers: Layer[] = [];
const chapters: (Chapter & { t: number })[] = [];
let t = 0;
let open: { path: string; at: number } | null = null;
const closeUnder = (now: number) => {
  if (!open) return;
  const dur = Math.min(durationOf(open.path), now - open.at + FADE);
  reelLayers.push({ path: open.path, at: open.at, dur, fadeOut: Math.min(FADE, dur) });
  open = null;
};
steps.forEach((step) => {
  if (step.chapter) chapters.push({ t: Math.round(t * 10) / 10, ...step.chapter });
  if (step.under) {
    closeUnder(t);
    if (step.under !== 'stop') open = { path: step.under, at: t };
  }
  if (step.file) {
    reelLayers.push({ path: step.file, at: t });
    t += durationOf(step.file) + (step.gap ?? 0.4);
  }
  t += step.hold ?? 0;
});
closeUnder(t);

/**
 * Between the moments a runner hears their own music, ducked while the race speaks. The reel
 * plays a stand-in playlist the same way, from the end of the gun's ambiance to the finish, so
 * the demo sounds like a run and not like a string of cues with silence between them.
 */
const busy = reelLayers.map((l) => [l.at ?? 0, (l.at ?? 0) + (l.dur ?? durationOf(l.path))] as const);
const gunChapter = chapters.find((c) => c.mark === 'gun')!.t;
const finishChapter = chapters.find((c) => c.mark === 'finish')!.t;
const musicFrom = gunChapter + 15;
const ducked = busy
  .filter(([a, b]) => b > musicFrom && a < finishChapter)
  .map(([a, b]) => `clip((t-${(a - musicFrom - 0.8).toFixed(2)})/0.8,0,1)*clip((${(b - musicFrom + 1.8).toFixed(2)}-t)/1.5,0,1)`)
  .reduce((acc, term) => `max(${acc},${term})`, '0');
const playlist = await source('playlist');
const playlistPath = join(OUT, 'reel-playlist.wav');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', playlist, '-ss', '20', '-t', String(finishChapter - musicFrom + 1), '-af', `volume='1-0.65*${ducked}':eval=frame,afade=t=in:d=2,afade=t=out:st=${(finishChapter - musicFrom - 0.5).toFixed(2)}:d=1.5`, playlistPath]);
reelLayers.push({ path: playlistPath, at: musicFrom, gain: -9 });
const reel: Cut = { layers: reelLayers, length: t + 1, lufs: -16 };
const reelPath = join(OUT, 'reel.mp3');
render(reel, reelPath);
writeFileSync(join(OUT, 'reel.json'), JSON.stringify(DemoReelSchema.parse({ courseId: script.courseId, duration: Math.round(durationOf(reelPath) * 10) / 10, paceSecPerKm: 283.2, chapters }), null, 2));
console.log(`reel: ${durationOf(reelPath).toFixed(1)} s, ${chapters.length} chapters -> ${reelPath}`);

/* ---------- into the studio ---------- */

if (target) {
  const bucket = target === 'preview' ? 'sivoov-run-files-preview' : 'sivoov-run-files';
  const dbName = target === 'preview' ? 'sivoov-run-preview' : 'sivoov-run';
  const where = target === 'local' ? ['--local', '--env', 'local'] : target === 'preview' ? ['--remote', '--env', 'preview'] : ['--remote'];
  const wrangler = (args: string[]) => execFileSync('npx', ['wrangler', ...args], { cwd: API_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
  const put = (key: string, path: string, type: string) => wrangler(['r2', 'object', 'put', `${bucket}/${key}`, '--file', path, '--content-type', type, ...where]);

  const upload = (path: string, name: string): UploadedAudio => {
    const hash = sha(path);
    put(`studio-uploads/${hash}.mp3`, path, 'audio/mpeg');
    return UploadedAudioSchema.parse({ kind: 'upload', hash, format: 'mp3', bytes: statSync(path).size, name });
  };
  const lines = script.lines.map((l) => {
    const m = mixed[l.id];
    return {
      ...l,
      ...(m?.file ? { audio: upload(m.file, `${l.key}.mp3 (produit)`) } : {}),
      ...(m?.under ? { under: upload(m.under, `${l.key}-ambiance.mp3 (produit)`) } : {}),
    };
  });
  const draft: AudioScript = AudioScriptSchema.parse({ ...script, lines });
  const q = (v: string) => `'${v.replaceAll("'", "''")}'`;
  const sqlFile = join(OUT, 'draft.sql');
  writeFileSync(
    sqlFile,
    `UPDATE audio_scripts SET script = ${q(JSON.stringify(draft))}, updated_at = ${q(new Date().toISOString())} WHERE course_id = ${q(script.courseId)} AND locale = ${q(script.locale)};`,
  );
  wrangler(['d1', 'execute', dbName, ...where, '--file', sqlFile]);
  put(`demo/${script.courseId}/reel.mp3`, reelPath, 'audio/mpeg');
  put(`demo/${script.courseId}/reel.json`, join(OUT, 'reel.json'), 'application/json');
  console.log(`draft and reel -> ${target}`);

  if (publish) {
    if (target === 'production') {
      console.log('production: open /org/10km-champs-elysees-2027/courses and press « Publier » (no test organizer there).');
    } else {
      const base = target === 'local' ? 'http://localhost:8788' : 'https://preview.run.sivoov.app';
      const signin = await fetch(`${base}/org/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ step: 'code', email: 'orga@example.com', code: '000000' }).toString(),
        redirect: 'manual',
      });
      const cookie = signin.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) throw new Error(`sign-in failed on ${base} (${signin.status})`);
      const res = await fetch(`${base}/org/${raceId}/courses/${script.courseId}/script/publish`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
      console.log(`publish on ${target}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  }
}
