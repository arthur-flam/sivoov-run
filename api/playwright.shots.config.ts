import { defineConfig } from '@playwright/test';

/** The web half of the screenshot rig (docs/SHOTS.md). Run it with `npm run shots` from the root. */
export type Preset = { id: string; width: number; height: number; scale: number; locale: string };

export const presets: Preset[] = [
  { id: 'web-mobile', width: 390, height: 844, scale: 2, locale: 'fr-FR' },
  { id: 'web-desktop', width: 1280, height: 900, scale: 2, locale: 'fr-FR' },
];

const wanted = (process.env.SHOTS_PRESETS ?? presets.map((p) => p.id).join(',')).split(',').map((s) => s.trim());
const chosen = presets.filter((p) => wanted.includes(p.id));

export default defineConfig({
  testDir: './e2e/shots',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:8788' },
  projects: chosen.map((p) => ({
    name: p.id,
    use: { viewport: { width: p.width, height: p.height }, deviceScaleFactor: p.scale, locale: p.locale },
    metadata: { preset: p },
  })),
  webServer: { command: 'npm run dev', url: 'http://localhost:8788/api/health', reuseExistingServer: true, timeout: 60_000 },
  reporter: [['list']],
});
