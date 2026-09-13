/**
 * Script -> script.json, the laptop path. The schemas and the domain live in
 * `@sivoov/shared` (schemas/audioScript.ts, domain/audioScript.ts) and are shared with the
 * organizer studio, which is now the primary way to edit a script (docs/AUDIO.md).
 * `npx tsx tools/audio/script.ts <courseId>` writes `.cache/audio/<courseId>/script.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildScript } from '@sivoov/shared';
import type { AudioScriptInput, BuiltScript } from '@sivoov/shared';

export type { AudioScriptInput, BuiltScript };

/** The fixtures that seed a draft. Editing happens in the studio once a race is live. */
export const scripts: Record<string, () => Promise<AudioScriptInput>> = {
  'deauville-2026-marathon': () => import('../../src/seed/deauvilleScript').then((m) => m.deauville2026MarathonScript),
};

export const loadScript = async (courseId: string): Promise<BuiltScript> => {
  const load = scripts[courseId];
  if (!load) throw new Error(`no script for course ${courseId}; known: ${Object.keys(scripts).join(', ')}`);
  return buildScript(await load());
};

export const cacheDir = (courseId: string) => new URL(`../../.cache/audio/${courseId}/`, import.meta.url).pathname;

if (process.argv[1]?.endsWith('script.ts')) {
  const courseId = process.argv[2] ?? 'deauville-2026-marathon';
  const built = await loadScript(courseId);
  mkdirSync(cacheDir(courseId), { recursive: true });
  writeFileSync(`${cacheDir(courseId)}script.json`, JSON.stringify(built, null, 2));
  console.log(JSON.stringify(built, null, 2));
}
