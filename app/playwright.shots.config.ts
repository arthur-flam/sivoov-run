import { defineConfig } from '@playwright/test';

/**
 * The screenshot rig (docs/SHOTS.md), separate from `playwright.config.ts` so the e2e suite
 * stays a test suite and this stays a camera. Run it with `npm run shots` from the root.
 *
 * Every preset is a Playwright project, so the whole matrix is one headless pass and the
 * project name is the output folder.
 */
export type Preset = {
  id: string;
  /** CSS pixels; multiplied by `scale` for the file on disk. */
  width: number;
  height: number;
  scale: number;
  locale: string;
  /** Store presets take only the scenes marked `store`, always at the exact viewport size. */
  store?: boolean;
};

export const presets: Preset[] = [
  { id: 'phone', width: 390, height: 844, scale: 2, locale: 'fr-FR' },
  { id: 'phone-en', width: 390, height: 844, scale: 2, locale: 'en-GB' },
  // App Store 6.9" slot: 1290 x 2796. Apple accepts this size for the largest iPhone class.
  { id: 'store-ios', width: 430, height: 932, scale: 3, locale: 'fr-FR', store: true },
  // Play Store phone: 1080 x 1920, the 9:16 shape Google has always accepted.
  { id: 'store-android', width: 360, height: 640, scale: 3, locale: 'fr-FR', store: true },
];

export const AUTH_STATE = 'test-results/shots/auth.json';

const wanted: string[] = String(process.env.SHOTS_PRESETS ?? 'phone').split(',').map((s: string) => s.trim());
const chosen = presets.filter((p) => wanted.includes(p.id));
if (chosen.length === 0) throw new Error(`SHOTS_PRESETS matched nothing. Known: ${presets.map((p) => p.id).join(', ')}`);

export default defineConfig({
  testDir: './e2e/shots',
  // The finished-run scene plays a whole half marathon, accelerated.
  timeout: 240_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:8081',
    // A locked-in fix, so the pre-flight GPS check passes on the web target.
    permissions: ['geolocation'],
    geolocation: { latitude: 49.3596, longitude: 0.0733, accuracy: 12 },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { viewport: { width: 390, height: 844 }, locale: 'fr-FR' } },
    ...chosen.map((p) => ({
      name: p.id,
      testMatch: /shots\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: p.width, height: p.height },
        deviceScaleFactor: p.scale,
        locale: p.locale,
        storageState: AUTH_STATE,
      },
      metadata: { preset: p },
    })),
  ],
  webServer: [
    { command: 'npm run dev -w api', cwd: '..', url: 'http://localhost:8788/api/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npx expo start --web --port 8081', url: 'http://localhost:8081', reuseExistingServer: true, timeout: 180_000, env: { EXPO_PUBLIC_API_URL: 'http://localhost:8788', CI: '1' } },
  ],
  reporter: [['list']],
});
