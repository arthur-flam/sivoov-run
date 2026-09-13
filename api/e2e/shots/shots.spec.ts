import { test } from '@playwright/test';
import type { Preset } from '../../playwright.shots.config';
import { scenes } from './scenes';

const OUT = '../docs/shots';

for (const scene of scenes) {
  test(scene.id, async ({ page }, testInfo) => {
    const preset = testInfo.project.metadata.preset as Preset;
    const shoot = async (name?: string) => {
      // The Worker tsconfig has no DOM lib, so no page.evaluate here: networkidle covers the
      // one thing that loads late on these pages, the Mapbox course PNG.
      await page.waitForLoadState('networkidle').catch(() => undefined);
      // These are ordinary documents, so the whole scroll height is one picture.
      await page.screenshot({ path: `${OUT}/${preset.id}/${name ? `${scene.id}-${name}` : scene.id}.png`, fullPage: true });
    };
    await scene.go(page, shoot);
  });
}
