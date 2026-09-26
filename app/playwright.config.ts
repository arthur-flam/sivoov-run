import { defineConfig } from '@playwright/test';
import { chromiumLaunch } from '../scripts/playwright-chromium';

/**
 * Drives the web target with the simulation location source (?sim=1&pace=5:00&speed=30).
 * Needs the API running on 8788 (npm run dev -w api) for sign-in; EXPO_PUBLIC_API_URL points at it.
 */
export default defineConfig({
  testDir: './e2e',
  // The screenshot rig lives under e2e/shots and runs from playwright.shots.config.ts.
  testIgnore: '**/shots/**',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:8081', viewport: { width: 390, height: 844 }, locale: 'fr-FR' , launchOptions: chromiumLaunch() },
  webServer: [
    { command: 'npm run dev -w api', cwd: '..', url: 'http://localhost:8788/api/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npx expo start --web --port 8081', url: 'http://localhost:8081', reuseExistingServer: true, timeout: 180_000, env: { EXPO_PUBLIC_API_URL: 'http://localhost:8788', CI: '1' } },
  ],
  reporter: [['list']],
});
