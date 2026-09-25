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
  const res = await page.request.post('/org/signin', {
    form: { step: 'code', email: 'orga@example.com', code: '000000' },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  await page.goto('/org/deauville-2026');
  await expect(page.getByText('Pour être prêt')).toBeVisible();
};

export const scenes: Scene[] = [
  {
    id: 'home',
    title: 'Home: the open races, and the way in for organizers',
    go: async (page, shoot) => {
      await page.goto('/');
      await expect(page.locator('.race-card').first()).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'organizers',
    title: 'Organizers: the page for race directors, then its form sent',
    go: async (page, shoot) => {
      await page.goto('/organisateurs');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('complète');
      await shoot();
      // A fresh address each pass: leads are capped at five a day per email.
      await page.getByLabel('Votre nom').fill('Claire Dubois');
      await page.getByLabel('Votre email').fill(`claire+${Date.now()}@example.com`);
      await page.getByLabel('Nom de la course').fill('Trail des Falaises');
      await page.getByRole('button', { name: 'Envoyer' }).click();
      await expect(page.getByText('Merci, Claire Dubois.')).toBeVisible();
      await shoot('sent');
    },
  },
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
    id: 'results',
    title: 'Results — empty before the window opens',
    go: async (page, shoot) => {
      await page.goto(`${RACE}/results`);
      await expect(page.getByRole('heading', { level: 2 })).toContainText('Résultats');
      await shoot();
    },
  },
  {
    id: 'org-signin',
    title: 'Organizer — sign-in',
    go: async (page, shoot) => {
      await page.goto('/org/signin');
      await expect(page.getByLabel('Adresse email')).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-home',
    title: 'Organizer — race home: numbers, latest activities, what is left to do',
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
      await page.getByRole('link', { name: 'Parcours et annonces' }).first().click();
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
      await page.goto('/org/deauville-2026/runners/import');
      await expect(page.getByRole('heading', { name: 'Importer des coureurs' })).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-runs',
    title: 'Organizer — activities: every run, filtered by outcome and distance',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.goto('/org/deauville-2026/runs');
      await expect(page.getByRole('heading', { name: 'Activités' })).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-run',
    title: 'Organizer — one finished run: time, trace (no tiles), kilometres, what was heard',
    go: async (page, shoot) => {
      await orgSignIn(page);
      // The sample finish from `npm run seed:runs`; `?map=svg` draws the trace without tiles or network.
      await page.goto('/org/deauville-2026/runs/seed-1001-half?map=svg');
      await expect(page.getByRole('heading', { name: 'Marc DUPONT' })).toBeVisible();
      await expect(page.getByRole('img', { name: 'Tracé GPS du coureur' })).toBeVisible();
      await shoot();
    },
  },
];
