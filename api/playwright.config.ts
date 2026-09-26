import { defineConfig } from '@playwright/test';
import { chromiumLaunch } from '../scripts/playwright-chromium';

/** Screenshots of the server-rendered pages against a local Worker (npm run dev -w api). */
export default defineConfig({
  testDir: './e2e',
  // The screenshot rig lives under e2e/shots and runs from playwright.shots.config.ts.
  testIgnore: '**/shots/**',
  timeout: 30_000,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:8788', viewport: { width: 390, height: 844 }, locale: 'fr-FR' , launchOptions: chromiumLaunch() },
  webServer: { command: 'npm run dev', url: 'http://localhost:8788/api/health', reuseExistingServer: true, timeout: 60_000 },
  reporter: [['list']],
});
