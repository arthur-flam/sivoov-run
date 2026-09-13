import { test as setup } from '@playwright/test';
import { AUTH_STATE } from '../../playwright.shots.config';
import { signIn } from './scenes';

/** One sign-in for the whole matrix: every preset reuses this storage state. */
setup('sign in once', async ({ page }) => {
  await signIn(page);
  await page.context().storageState({ path: AUTH_STATE });
});
