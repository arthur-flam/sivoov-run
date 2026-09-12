import { expect, test } from '@playwright/test';

const shots = 'test-results/shots';

test('landing renders the race and the course diagram', async ({ page }) => {
  await page.goto('/deauville-2026');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deauville');
  await expect(page.locator('svg[role=img]')).toBeVisible();
  await page.screenshot({ path: `${shots}/landing-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${shots}/landing-desktop.png`, fullPage: true });
});

test('sign-in with a magic code reaches the install page', async ({ page }) => {
  await page.goto('/deauville-2026/signin');
  await page.screenshot({ path: `${shots}/signin.png`, fullPage: true });
  await page.getByLabel('Numéro de dossard').fill('1001');
  await page.getByLabel('Email').fill('marc@example.com');
  await page.getByRole('button', { name: 'Recevoir mon code' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre code');
  await page.screenshot({ path: `${shots}/signin-code.png`, fullPage: true });
  // Local environment pre-fills the code (devCode); production never does.
  await expect(page.getByLabel('Code à 6 chiffres')).toHaveValue(/\d{6}/);
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page).toHaveURL(/\/deauville-2026\/app$/);
  await expect(page.getByText('Bienvenue, Marc.')).toBeVisible();
  await page.screenshot({ path: `${shots}/app-install.png`, fullPage: true });
});

test('results page is empty before the window', async ({ page }) => {
  await page.goto('/deauville-2026/results');
  await expect(page.getByRole('heading', { level: 2 })).toContainText('Résultats');
  await page.screenshot({ path: `${shots}/results.png`, fullPage: true });
});
