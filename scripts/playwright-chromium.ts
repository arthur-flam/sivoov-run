import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Launch options that make the pinned Playwright run in a cloud container, whose pre-installed
 * Chromium (`$PLAYWRIGHT_BROWSERS_PATH/chromium`) is older than the one the package asks for.
 * Anywhere else (a laptop with `playwright install`) it is empty and Playwright picks its own.
 */
export const chromiumLaunch = (): { executablePath?: string } => {
  // An explicit PW_CHROMIUM wins (docs/SHOTS.md); otherwise the container's own copy if present.
  if (process.env.PW_CHROMIUM) return { executablePath: process.env.PW_CHROMIUM };
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const path = root ? join(root, 'chromium') : '';
  return path && existsSync(path) ? { executablePath: path } : {};
};
