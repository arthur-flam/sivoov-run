import { expect, test } from '@playwright/test';

const shots = 'test-results/shots';

/** Organizer admin: sign in with the local devCode, screenshot the race home and the import page. */
test('organizer signs in and sees the race home', async ({ page }) => {
  await page.goto('/org/signin');
  await page.screenshot({ path: `${shots}/org-signin.png`, fullPage: true });
  await page.getByLabel('Adresse email').fill('orga@example.com');
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  await expect(page.getByLabel('Code à 6 chiffres')).toHaveValue(/\d{6}/);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page).toHaveURL(/\/org\/deauville-2026$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deauville');
  await page.screenshot({ path: `${shots}/org-home-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${shots}/org-home-desktop.png`, fullPage: true });
  await page.getByRole('link', { name: 'Importer des coureurs' }).click();
  await page.screenshot({ path: `${shots}/org-import.png`, fullPage: true });
});
