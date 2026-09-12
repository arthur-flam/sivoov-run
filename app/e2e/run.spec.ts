import { expect, test } from '@playwright/test';

const shots = 'test-results/shots';

test('sign in, then run a simulated half at 5:00/km in accelerated time', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/signin/);
  await page.screenshot({ path: `${shots}/signin.png` });
  await page.getByTestId('bib').fill('1001');
  await page.getByTestId('email').fill('marc@example.com');
  await page.getByTestId('send').click();
  await expect(page.getByTestId('code')).toHaveValue(/\d{6}/, { timeout: 15_000 });
  await page.getByTestId('verify').click();
  await expect(page).toHaveURL(/home/);
  await expect(page.getByTestId('bib-number')).toHaveText('1001');
  await page.screenshot({ path: `${shots}/home.png` });

  await page.goto('/run?sim=1&pace=5:00&speed=60&noise=4');
  await expect(page.getByTestId('sim-badge')).toBeVisible();
  await page.screenshot({ path: `${shots}/run-ready.png` });
  await page.getByTestId('start').click();
  await expect(page.getByTestId('distance')).toBeVisible({ timeout: 15_000 });
  // 2 km at 5:00/km is 10 minutes of race, 10 seconds at x60.
  await expect(page.getByTestId('distance')).toContainText(/^[1-9],\d\d km$/, { timeout: 30_000 });
  await page.screenshot({ path: `${shots}/run-live.png` });
  await expect(page.getByTestId('pace')).not.toHaveText('--:--');
  await expect(page.getByTestId('now-playing')).toBeVisible();
  // The half (21.1 km) at 5:00/km is 105 minutes: 105 s at x60.
  await expect(page.getByTestId('final-time')).toBeVisible({ timeout: 110_000 });
  await expect(page.getByTestId('final-time')).toHaveText(/^1:4[5-7]:\d\d$/);
  await page.screenshot({ path: `${shots}/run-finished.png`, fullPage: true });
});
