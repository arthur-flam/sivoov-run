import { test } from '@playwright/test';
import type { Preset } from '../../playwright.shots.config';
import { scenes, settle } from './scenes';

const OUT = '../docs/shots';

/**
 * Simulation badges and the dev-only run link belong in the design loop but never in a
 * store screenshot. Hidden rather than removed, so the layout stays exactly the store size.
 */
// 'open-debug' is the way into the device logbook: wanted on a phone under test, never in a
// store screenshot (docs/MEMORY.md).
const DEV_CHROME = ['sim-badge', 'sim-badge-live', 'sim-badge-finish', 'dev-sim-link', 'open-debug']
  .map((id) => `[data-testid="${id}"]`)
  .join(', ')
  .concat(' { visibility: hidden !important; }');

for (const scene of scenes) {
  test(scene.id, async ({ page }, testInfo) => {
    const preset = testInfo.project.metadata.preset as Preset;
    test.skip(Boolean(preset.store) && !scene.store, 'not a store scene');

    if (scene.signedOut) {
      await page.goto('/signin');
      await page.evaluate(() => globalThis.localStorage?.clear());
    }

    const shoot = async (name?: string) => {
      // Re-injected per frame: every page.goto in a scene drops the previous style tag.
      if (preset.store) await page.addStyleTag({ content: DEV_CHROME });
      await settle(page);
      await page.screenshot({ path: `${OUT}/${preset.id}/${name ? `${scene.id}-${name}` : scene.id}.png` });
    };

    await scene.go(page, shoot);
  });
}
