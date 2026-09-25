import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Takes one frame. Called with no name it writes `<scene>.png`, otherwise `<scene>-<name>.png`. */
export type Shoot = (name?: string) => Promise<void>;

/** A server-rendered page worth a picture. Add one here and it appears in the contact sheet. */
export type Scene = { id: string; title: string; go: (page: Page, shoot: Shoot) => Promise<void> };

const RACE = '/deauville-2026';

/**
 * Organizer pages need a session. It is taken with TEST_CODE in one form post (the request
 * context shares the page's cookies), which asks for no emailed code: with four organizer
 * scenes across two presets, the five-codes-per-hour cap would otherwise trip.
 */
const orgSignIn = async (page: Page): Promise<void> => {
  const res = await page.request.post('/org/deauville-2026/signin', {
    form: { step: 'code', email: 'orga@example.com', code: '000000' },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  await page.goto('/org/deauville-2026');
  await expect(page.getByText('Espace organisateur')).toBeVisible();
};

/** A runner's web session, taken with TEST_CODE in one form post like `orgSignIn`, landing on `next`. */
const runnerSignIn = async (page: Page, next: string): Promise<void> => {
  const res = await page.request.post(`${RACE}/signin`, {
    form: { step: 'code', bib: '1001', email: 'marc@example.com', code: '000000', next },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  await page.goto(next);
};

/** A straight run due north, one point every 5 s, as a watch exports it. 111 195 m is one degree of latitude. */
const gpxRun = (meters: number): Buffer => {
  const t0 = Date.parse('2026-11-11T08:00:00+01:00');
  const n = Math.round((meters / 1000) * 60);
  const points = Array.from({ length: n + 1 }, (_, i) =>
    `<trkpt lat="${(49.36 + (i * meters) / n / 111_195).toFixed(7)}" lon="0.0700000"><time>${new Date(t0 + i * 5000).toISOString()}</time></trkpt>`,
  );
  return Buffer.from(`<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${points.join('')}</trkseg></trk></gpx>`);
};

export const scenes: Scene[] = [
  {
    id: 'landing',
    title: 'Landing — the race, the course, the pitch',
    go: async (page, shoot) => {
      await page.goto(RACE);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Deauville');
      await shoot();
    },
  },
  {
    id: 'signin',
    title: 'Sign-in — bib and email',
    go: async (page, shoot) => {
      await page.goto(`${RACE}/signin`);
      await expect(page.getByLabel('Numéro de dossard')).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'signin-code',
    title: 'Sign-in — the six-digit code',
    go: async (page, shoot) => {
      await page.goto(`${RACE}/signin`);
      await page.getByLabel('Numéro de dossard').fill('1001');
      await page.getByLabel('Email').fill('marc@example.com');
      await page.getByRole('button', { name: 'Recevoir mon code' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre code');
      await shoot();
    },
  },
  {
    id: 'install',
    title: 'Install — where the runner gets the app',
    go: async (page, shoot) => {
      await page.goto(`${RACE}/signin`);
      // A different entrant from the signin-code scene: codes are capped at 5 per hour each.
      await page.getByLabel('Numéro de dossard').fill('1002');
      await page.getByLabel('Email').fill('lea@example.com');
      await page.getByRole('button', { name: 'Recevoir mon code' }).click();
      await expect(page.getByLabel('Code à 6 chiffres')).toHaveValue(/\d{6}/);
      await page.getByRole('button', { name: 'Valider' }).click();
      await expect(page).toHaveURL(new RegExp(`${RACE}/app$`));
      await shoot();
    },
  },
  {
    id: 'upload',
    title: 'Upload — the GPX fallback, one file and one button',
    go: async (page, shoot) => {
      await runnerSignIn(page, `${RACE}/upload`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Envoyer ma course');
      await shoot();
    },
  },
  {
    id: 'upload-refused',
    title: 'Upload — refused: a watch that died at 20.4 km, then a treadmill file',
    go: async (page, shoot) => {
      await runnerSignIn(page, `${RACE}/upload`);
      await page.getByLabel('Votre fichier GPX').setInputFiles({ name: 'course.gpx', mimeType: 'application/gpx+xml', buffer: gpxRun(20_400) });
      await page.getByRole('button', { name: 'Envoyer mon fichier' }).click();
      await expect(page.getByRole('alert')).toContainText('il manque');
      await shoot();
      const treadmill = '<gpx><trk><trkseg><trkpt><time>2026-11-11T08:00:00Z</time></trkpt><trkpt><time>2026-11-11T08:00:01Z</time></trkpt></trkseg></trk></gpx>';
      await page.getByLabel('Votre fichier GPX').setInputFiles({ name: 'tapis.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(treadmill) });
      await page.getByRole('button', { name: 'Envoyer mon fichier' }).click();
      await expect(page.getByRole('alert')).toContainText('tapis');
      await shoot('treadmill');
    },
  },
  {
    id: 'results',
    title: 'Results — the half marathon table (demo results, scripts/shots-demo.sql)',
    go: async (page, shoot) => {
      await page.goto(`${RACE}/results?distance=half`);
      await expect(page.getByRole('heading', { level: 2 })).toContainText('Résultats');
      await shoot();
    },
  },
  {
    id: 'result',
    title: 'Result — a finisher’s certificate, and the way into the race for everyone else',
    go: async (page, shoot) => {
      await page.goto(`${RACE}/results/1003`);
      await expect(page.getByTestId('result-time')).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'result-pending',
    title: 'Result — before the finish, the bib page a runner shares to bring friends in',
    go: async (page, shoot) => {
      await page.goto(`${RACE}/results/1002`);
      await expect(page.getByTestId('bib-plate')).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'card-bib',
    title: 'Share card — the bib, under a link shared before the race',
    go: async (page, shoot) => {
      await page.setViewportSize({ width: 1200, height: 630 });
      await page.goto(`${RACE}/results/1002/card?format=og`);
      await shoot();
    },
  },
  {
    id: 'card-og',
    title: 'Share card — 1200×630, the picture under a shared link',
    go: async (page, shoot) => {
      await page.setViewportSize({ width: 1200, height: 630 });
      await page.goto(`${RACE}/results/1003/card?format=og`);
      await shoot();
    },
  },
  {
    id: 'card-story',
    title: 'Share card — 1080×1350, the image a finisher posts',
    go: async (page, shoot) => {
      await page.setViewportSize({ width: 1080, height: 1350 });
      await page.goto(`${RACE}/results/1003/card?format=story`);
      await shoot();
    },
  },
  {
    id: 'card-race',
    title: 'Share card — the race’s own, under a shared landing page',
    go: async (page, shoot) => {
      await page.setViewportSize({ width: 1200, height: 630 });
      await page.goto(`${RACE}/card?format=og`);
      await shoot();
    },
  },
  {
    id: 'org-signin',
    title: 'Organizer — sign-in',
    go: async (page, shoot) => {
      await page.goto('/org/deauville-2026/signin');
      await expect(page.getByLabel('Email')).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-home',
    title: 'Organizer — counts and the entrant list',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await shoot();
    },
  },
  {
    id: 'org-courses',
    title: 'Organizer — courses, their trace and their audio',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.getByRole('link', { name: 'Parcours et audio' }).click();
      await expect(page.getByRole('heading', { name: 'Ajouter un parcours' })).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-studio',
    title: 'Organizer — the audio studio, schematic course (no tiles)',
    go: async (page, shoot) => {
      await orgSignIn(page);
      // `?map=svg` is the offline path: the SVG diagram carries the same event markers as the map.
      await page.goto('/org/deauville-2026/courses/deauville-2026-marathon?map=svg');
      await expect(page.getByRole('heading', { name: /Studio/ })).toBeVisible();
      await expect(page.locator('.ev').first()).toBeVisible();
      await shoot();
      await page.locator('.ev-name').filter({ hasText: /^Les Planches$/ }).click();
      await expect(page.locator('.ev.open textarea')).toBeVisible();
      await shoot('event');
    },
  },
  {
    id: 'org-import',
    title: 'Organizer — CSV import',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.getByRole('link', { name: 'Importer un CSV' }).click();
      await expect(page).toHaveURL(/import$/);
      await shoot();
    },
  },
];
