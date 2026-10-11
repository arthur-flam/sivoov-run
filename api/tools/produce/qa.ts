/**
 * The page to check the produced sound by ear: `out/qa/index.html`, rewritten after every run.
 * One row per line and take: its words, the voice takes in its file (voice, model, take number,
 * what the transcription heard), the file the app plays and the ambiance under it; the reel and
 * the full runs on top. Courses not produced yet show « pas de fichier ».
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildScript, voicingsOf } from '@sivoov/shared';
import type { AudioScript, ScriptLine, Voicing } from '@sivoov/shared';
import { CACHE } from './assets';

const OUT = join(CACHE, 'out');
const QA = join(OUT, 'qa');

type Origins = { voices: { file: string; model: string; voice: string; take: number }[]; mixes: Record<string, { path: string; sources: string[] }> };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const readOr = (path: string, otherwise: string) => (existsSync(path) ? readFileSync(path, 'utf8') : otherwise);
const player = (path: string) => `<audio controls preload="none" src="${esc(relative(QA, path))}"></audio>`;

const takeNote = (origins: Origins) => (source: string) => {
  const o = origins.voices.find((v) => v.file === source);
  const heard = readOr(source.replace(/\.wav$/, '.heard.txt'), '').trim();
  const who = o ? `${esc(o.voice)} · ${esc(o.model)} · prise ${o.take}` : 'prise d’avant les origines';
  return `<div class="take">${who}${heard ? ` · entendu : « ${esc(heard)} »` : ''}</div>`;
};

const row = (origins: Origins) => (line: ScriptLine, v: Voicing) => {
  const mix = origins.mixes[v.fileKey];
  const under = v.take ? undefined : origins.mixes[`${line.key}-under.mp3`];
  const takes = (mix?.sources ?? []).filter((s) => s.includes('/voices/')).map(takeNote(origins));
  const name = `<b>${esc(line.title)}</b><br><code>${esc(line.id)}${v.take ? ` ~${esc(v.take)}` : ''}</code>${v.when ? ` <i>${v.when}</i>` : ''}${v.personal ? ' <span class="tag">prénom</span>' : ''}`;
  const plays = mix ? player(mix.path) : '<span class="miss">pas de fichier</span>';
  return `<tr><td>${name}</td><td>${esc(v.text)}${takes.join('')}</td><td>${plays}${under ? `<div class="under">ambiance ${player(under.path)}</div>` : ''}</td></tr>`;
};

const section = (script: AudioScript) => {
  const dir = join(OUT, script.courseId);
  const origins = JSON.parse(readOr(join(dir, 'origins.json'), '{"voices":[],"mixes":{}}')) as Origins;
  const rows = buildScript(script).lines.flatMap((line) => voicingsOf(line, 'mp3').map((v) => row(origins)(line, v)));
  const runs = (existsSync(dir) ? readdirSync(dir) : []).filter((f) => /^(reel|run-[\d-]+)\.mp3$/.test(f)).map((f) => {
    const timeline = join(dir, f.replace(/\.mp3$/, '.md'));
    return `<li>${f} ${player(join(dir, f))}${existsSync(timeline) ? ` <a href="${esc(relative(QA, timeline))}">timeline</a>` : ''}</li>`;
  });
  return `<h2>${esc(script.courseId)}</h2><ul>${runs.join('')}</ul><table><tr><th>Ligne</th><th>Texte · prises de voix</th><th>Ce que l’app joue</th></tr>${rows.join('')}</table>`;
};

/** Writes the page for these courses and says where it is. */
export const writeQa = (scripts: AudioScript[]): string => {
  mkdirSync(QA, { recursive: true });
  const file = join(QA, 'index.html');
  writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><title>Contrôle du son</title><style>
body{font:14px/1.4 system-ui;margin:16px;max-width:1200px} table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}
code{color:#666} .take{color:#555;font-size:12px;margin-top:4px} .tag{background:#eef;border-radius:4px;padding:0 4px;font-size:11px} .miss{color:#b91c1c} .under{font-size:12px;color:#666} audio{height:28px;width:260px} ul audio{width:360px}
</style><h1>Contrôle du son</h1><p>« entendu » : ce que la vérification a compris de chaque prise.</p>${scripts.map(section).join('')}`,
  );
  return file;
};
