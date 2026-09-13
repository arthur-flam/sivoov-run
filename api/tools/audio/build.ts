/**
 * The audio pipeline, end to end, for one course:
 *   npm run audio:build -w api -- <local|preview|production> [courseId]
 * script (typed fixture) -> tts (ElevenLabs, cached) -> R2 + audio_packs row.
 * Idempotent per (course, version): cached MP3s are reused, objects overwritten, the row upserted.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cacheDir, loadScript } from './script';
import { renderScript } from './tts';
import { isTarget, manifestFor, uploadPack } from './upload';

const target = process.argv[2];
if (!isTarget(target)) throw new Error('usage: build.ts local|preview|production [courseId]');
const courseId = process.argv[3] ?? 'deauville-2026-marathon';

const script = await loadScript(courseId);
console.log(`script ${courseId} v${script.version}: ${script.events.length} events, voice ${script.voice.name}`);
mkdirSync(cacheDir(courseId), { recursive: true });
writeFileSync(`${cacheDir(courseId)}script.json`, JSON.stringify(script, null, 2));

const rendered = await renderScript(script);
const pack = manifestFor(script, rendered);
writeFileSync(`${cacheDir(courseId)}manifest.json`, JSON.stringify(pack, null, 2));
console.log(`rendered ${rendered.length} files, ${rendered.reduce((n, r) => n + r.bytes, 0)} bytes`);

uploadPack(target, pack, rendered);
console.log(`audio pack ${courseId} v${pack.version} -> ${target}`);
