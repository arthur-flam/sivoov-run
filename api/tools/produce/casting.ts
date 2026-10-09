/**
 * Casting the race speaker (PRODUCTION.md, « Casting the voice »): the same three lines said by
 * each shortlisted Gemini voice under two directions, filed under blind codes for a listener,
 * plus a dozen first names said by the voice that is chosen.
 *
 *   npm run casting -w api              # renders, then api/.produce/out/casting/index.html
 *   npm run casting -w api -- names Orus "<direction>"
 *
 * The page hides who is who; `key.json` beside it says. Renders are cached like the
 * production's (api/.produce/voices), so a second run only renders what is new.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEMINI_TTS_MODEL } from '@sivoov/shared';
import { CACHE, voice, voiceEnvFromDotenv } from './assets';

const OUT = join(CACHE, 'out', 'casting');
mkdirSync(OUT, { recursive: true });
const env = voiceEnvFromDotenv();

/** Google's descriptions (ai.google.dev, speech generation, 2026-10-09), deep and mature first, Sadachbia the reference. */
const SHORTLIST = ['Algenib', 'Alnilam', 'Orus', 'Charon', 'Rasalgethi', 'Sadaltager', 'Iapetus', 'Fenrir', 'Sadachbia'];

const DIRECTIONS = {
  commentateur:
    'Le speaker du 10 km des Champs-Élysées : un homme d’une cinquantaine d’années, voix grave et chaude, l’énergie d’un commentateur sportif à la radio. Parisien. Le sourire dans la voix, jamais criard.',
  veteran:
    'Un homme de cinquante-cinq ans qui anime cette course depuis quinze ans et l’aime toujours. Voix posée, grave, un peu de grain, qui s’emballe quand la course s’emballe. Complice, rapide, accent parisien naturel.',
} as const;

const LINES = [
  {
    id: 'accueil',
    scene: 'Sur la sono du village de départ, devant vingt mille coureurs.',
    style: 'Voix projetée, grande, publique.',
    text: 'Bonjour Paris ! Camille… bienvenue sur les Champs-Élysées ! Vingt mille coureurs cette semaine sur la plus belle avenue du monde… et vous en êtes.',
  },
  {
    id: 'montee',
    scene: 'Tout près, dans les écouteurs d’un coureur qui monte les pavés.',
    style: 'Bas, proche, posé : un ami qui court à côté.',
    text: 'Petits pas. Les bras. L’Arc ne bouge pas, Camille… c’est vous qui avancez.',
  },
  {
    id: 'arrivee',
    scene: 'Sur la sono de la ligne d’arrivée, dans la clameur.',
    style: 'Explosion de joie, voix de fête.',
    text: 'Camille Martin ! Quarante-sept minutes et douze secondes ! Vous avez bouclé le 10 km des Champs-Élysées !',
  },
];

const NAMES = ['Camille', 'Mohamed', 'Jean-Baptiste', 'Aïcha', 'Kevin', 'Siobhan', 'Nguyen', 'Marie-Claire', 'Yasmine', 'Thibault', 'Mei', 'Oluwaseun', 'Björn', 'Inès'];

const mp3 = (wav: string, out: string) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5', '-c:a', 'libmp3lame', '-b:a', '128k', out]);

/** A stable, meaningless code per candidate, so the page gives nothing away. */
const codeOf = (name: string, direction: string) => createHash('sha256').update(`${name}|${direction}|casting`).digest('hex').slice(0, 4).toUpperCase();

const [mode, who, direction] = process.argv.slice(2);

if (mode === 'names') {
  if (!who) throw new Error('usage: casting.ts names <Voice> [direction]');
  const v = { id: who, name: who, model: GEMINI_TTS_MODEL };
  const files: string[] = [];
  for (const name of NAMES) {
    const wav = await voice(env, v, `Allez ${name} ! … ${name}, vous y êtes !`, direction ?? DIRECTIONS.commentateur, 'Sur la sono, au bord de la route, au passage d’un coureur.');
    const out = join(OUT, `name-${name.toLowerCase().normalize('NFD').replace(/[^a-z-]/g, '')}.mp3`);
    mp3(wav, out);
    files.push(out);
    console.log(`  ${name}`);
  }
  writeFileSync(join(OUT, 'names.html'), page('Les prénoms', files.map((f, i) => ({ code: NAMES[i]!, files: [f] }))));
  console.log(`-> ${join(OUT, 'names.html')}`);
} else {
  const candidates = SHORTLIST.flatMap((name) => Object.entries(DIRECTIONS).map(([d, notes]) => ({ name, d, notes, code: codeOf(name, d) })));
  const rows: { code: string; files: string[] }[] = [];
  for (const c of candidates) {
    const v = { id: c.name, name: c.name, model: GEMINI_TTS_MODEL };
    const files: string[] = [];
    for (const l of LINES) {
      const wav = await voice(env, v, l.text, `${c.notes} ${l.style}`, l.scene);
      const out = join(OUT, `${c.code}-${l.id}.mp3`);
      mp3(wav, out);
      files.push(out);
    }
    rows.push({ code: c.code, files });
    console.log(`  ${c.code}`);
  }
  // Shuffled by code: the page's order says nothing about the shortlist's.
  rows.sort((a, b) => a.code.localeCompare(b.code));
  writeFileSync(join(OUT, 'index.html'), page('Casting du speaker (à l’aveugle)', rows));
  writeFileSync(join(OUT, 'key.json'), JSON.stringify(Object.fromEntries(candidates.map((c) => [c.code, { voice: c.name, direction: c.d }])), null, 2));
  console.log(`-> ${join(OUT, 'index.html')} (key.json says who is who)`);
}

function page(title: string, rows: { code: string; files: string[] }[]): string {
  const cells = rows
    .map(
      (r) =>
        `<tr><th>${r.code}</th>${r.files.map((f) => `<td><audio controls preload="none" src="${f.split('/').pop()}"></audio></td>`).join('')}<td><input size="3" placeholder="/5"></td><td><input placeholder="note"></td></tr>`,
    )
    .join('\n');
  const heads = rows[0]!.files.length === LINES.length ? LINES.map((l) => `<th>${l.id}</th>`).join('') : '<th>prénom</th>';
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{font:15px system-ui;margin:24px}td,th{padding:6px 8px;text-align:left}audio{width:220px}</style>
<h1>${title}</h1><p>Écoutez chaque ligne, notez de 1 à 5. Le brief : un speaker d’une cinquantaine d’années, commentateur sportif, parisien, sur la sono et dans l’oreille.</p>
<table><tr><th></th>${heads}<th>note</th><th></th></tr>
${cells}
</table>`;
}
