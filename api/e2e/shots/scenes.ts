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
      // A fresh address and network each pass: leads are capped at five a day per email and three
      // per network (the address `wrangler dev` passes on as CF-Connecting-IP).
      await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': `198.51.100.${Date.now() % 250}` });
      await page.getByLabel('Votre nom').fill('Claire Dubois');
      await page.getByLabel('Votre email').fill(`claire+${Date.now()}@example.com`);
      await page.getByLabel('Nom de la course').fill('Trail des Falaises');
      await page.getByRole('button', { name: 'Envoyer' }).click();
      await expect(page.getByText('Merci, Claire Dubois.')).toBeVisible();
      await shoot('sent');
    },
  },
  {
    id: 'privacy',
    title: 'Privacy: what the app collects, and « Supprimer mes données »',
    go: async (page, shoot) => {
      await page.goto('/confidentialite');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confidentialité');
      await shoot();
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
    title: 'Sign-in — the email of the entry',
    go: async (page, shoot) => {
      await page.goto(`${RACE}/signin`);
      await expect(page.getByLabel('Email')).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'signin-code',
    title: 'Sign-in — the six-digit code',
    go: async (page, shoot) => {
      await page.goto(`${RACE}/signin`);
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
    title: 'Race report — 1200×630, the picture under a shared link',
    go: async (page, shoot) => {
      await page.setViewportSize({ width: 1200, height: 630 });
      await page.goto(`${RACE}/results/1003/card?format=og`);
      await expect(page.getByTestId('card-time')).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'card-post',
    title: 'Race report — 1080×1350, the feed post (Instagram, Facebook, Strava)',
    go: async (page, shoot) => {
      await page.setViewportSize({ width: 1080, height: 1350 });
      await page.goto(`${RACE}/results/1003/card?format=post`);
      await shoot();
    },
  },
  {
    id: 'card-story',
    title: 'Race report — 1080×1920, the story (Instagram, WhatsApp status)',
    go: async (page, shoot) => {
      await page.setViewportSize({ width: 1080, height: 1920 });
      await page.goto(`${RACE}/results/1003/card?format=story`);
      await shoot();
    },
  },
  {
    id: 'card-sticker',
    title: 'Sticker — transparent, over a photo here to show it (the PNG has no ground)',
    go: async (page, shoot) => {
      await page.setViewportSize({ width: 1080, height: 1920 });
      await page.goto(`${RACE}/results/1003/card?format=sticker`);
      // Stands in for the runner's own photo: the card itself leaves the ground transparent.
      await page.addStyleTag({ content: 'html { background: linear-gradient(160deg, #2f4f4f, #8a7f72 60%, #3b3f46); }' });
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
    id: 'photos',
    title: 'Race photos — a runner’s photo moments, one picture made (local stand-in: no image model)',
    go: async (page, shoot) => {
      // A stand-in "selfie": the local Worker has no image model and hands the photo back as the picture.
      const painter = await page.context().newPage();
      await painter.setViewportSize({ width: 800, height: 1000 });
      await painter.setContent(
        '<body style="margin:0;display:grid;place-items:center;height:100vh;background:linear-gradient(160deg,#2f5d7c,#e3b38a);font:600 42px system-ui;color:#fff;text-align:center">Photo de démonstration<br>(pas de modèle d’image en local)</body>',
      );
      const selfie = await painter.screenshot({ type: 'png' });
      await painter.close();
      await runnerSignIn(page, `${RACE}/photos`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Vos photos de course');
      await shoot('empty');
      const moment = page.getByTestId('moment-deauville-2026-photo-finish');
      // A second pass finds a picture already there: the form is then behind « Une autre photo ».
      if (await moment.locator('details.photo-another').count()) await moment.locator('details.photo-another summary').click();
      await moment.getByLabel(/Votre photo|Une autre photo/).setInputFiles({ name: 'moi.png', mimeType: 'image/png', buffer: selfie });
      await moment.getByRole('checkbox').check();
      await moment.getByRole('button', { name: 'Me mettre dans la course' }).click();
      await expect(page.getByTestId('runner-photo')).toBeVisible({ timeout: 20_000 });
      await shoot();
    },
  },
  {
    id: 'org-photos',
    title: 'Organizer — photo moments: where runners are asked for a selfie, and the scene',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.goto('/org/deauville-2026/photos');
      await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
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
      await expect(page.getByRole('heading', { name: 'Ajouter une distance' })).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-studio',
    title: 'Organizer — the audio studio: what the runner hears and where, schematic course (no tiles)',
    go: async (page, shoot) => {
      await orgSignIn(page);
      // `?map=svg` is the offline path: the SVG diagram carries the same event markers as the map.
      await page.goto('/org/deauville-2026/courses/deauville-2026-marathon?map=svg');
      await expect(page.getByRole('heading', { name: /Annonces/ })).toBeVisible();
      await expect(page.locator('.ev').first()).toBeVisible();
      await shoot();
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
    id: 'org-runners',
    title: 'Organizer: runners, who reached the app, who ran',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await seedRunners(page);
      await page.goto('/org/deauville-2026/runners');
      await expect(page.getByRole('heading', { name: 'Coureurs', level: 1 })).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-settings',
    title: 'Organizer: race settings, the race, the window, colors and pictures, publication',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.goto('/org/deauville-2026/settings');
      await expect(page.getByRole('heading', { name: 'Apparence' })).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-runner',
    title: 'Organizer: one runner, their phone and their runs',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await seedRunners(page);
      await page.goto('/org/deauville-2026/runners/1004');
      await expect(page.getByText('Connecté dans l’application')).toBeVisible();
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
  {
    id: 'org-team',
    title: 'Organizer: the team, roles and the invitation form',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.goto('/org/deauville-2026/team');
      await expect(page.getByRole('heading', { name: 'Inviter quelqu’un' })).toBeVisible();
      await shoot();
      await page.locator('summary', { hasText: 'Modifier' }).nth(2).click();
      await expect(page.getByRole('button', { name: 'Changer le rôle' }).first()).toBeVisible();
      await shoot('edit');
    },
  },
  {
    id: 'org-new-race',
    title: 'Sivoov staff: create a race',
    go: async (page, shoot) => {
      // Staff, not an organizer: the same one-post session as orgSignIn, for staff@example.com.
      const res = await page.request.post('/org/signin', { form: { step: 'code', email: 'staff@example.com', code: '000000' }, maxRedirects: 0 });
      expect(res.status()).toBe(302);
      await page.goto('/org/new');
      await expect(page.getByRole('heading', { name: 'Nouvelle course' })).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-import-preview',
    title: 'Organizer: the import preview, one line refused',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.goto('/org/deauville-2026/runners/import');
      await page.getByText('Ou collez les lignes copiées depuis votre tableur').click();
      await page.locator('#csv').fill(
        ['Dossard;Prénom;Nom;Email;Distance;Code postal;Ville', '2101;Emma;Garcia;emma.garcia@example.com;Semi;14000;Caen', '2102;Jules;Fournier;jules.fournier@example.com;42,195 km;;', '2103;Alice;Girard;alice.girard@;Semi;;', '1002;Léa;Martin;lea@example.com;Marathon;;'].join('\n'),
      );
      await page.getByRole('button', { name: 'Vérifier le fichier' }).click();
      await expect(page.getByRole('heading', { name: 'Vérifiez avant d’importer' })).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'org-studio-edit',
    title: 'Organizer — the studio with one announcement open in the simple editor',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.goto('/org/deauville-2026/courses/deauville-2026-marathon?map=svg');
      await page.locator('.ev-name').filter({ hasText: /^Les Planches$/ }).click();
      await expect(page.locator('.ev.open textarea[name="text"]')).toBeVisible();
      await expect(page.locator('.ev.open').getByText('Réglages avancés')).toBeVisible();
      // Clicking scrolled the row into view; a full-page picture is taken from the top (sticky header).
      await page.mouse.wheel(0, -10_000);
      await shoot();
    },
  },
  {
    id: 'org-studio-personal',
    title: 'Organizer — a personal line: the runner called by bib and name, its fields, its offline version',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.goto('/org/deauville-2026/courses/deauville-2026-marathon?map=svg');
      await page.locator('.ev-name').filter({ hasText: /^L’appel sur la ligne$/ }).click();
      await expect(page.locator('.ev.open [data-role="fields"]')).toBeVisible();
      await page.mouse.wheel(0, -10_000);
      await shoot();
    },
  },
  {
    id: 'org-studio-voice',
    title: 'Organizer — choosing the voice of the course',
    go: async (page, shoot) => {
      await orgSignIn(page);
      await page.goto('/org/deauville-2026/courses/deauville-2026-marathon?map=svg');
      await page.getByRole('button', { name: 'Changer de voix' }).click();
      await expect(page.getByRole('heading', { name: 'La voix de la course' })).toBeVisible();
      await shoot();
    },
  },
];

/**
 * A few more runners for the runner scenes, through the real endpoints: an import, two app
 * sign-ins (TEST_CODE, so no code is issued) with the app's header, and a finished marathon.
 * Idempotent, so every preset can call it.
 */
async function seedRunners(page: Page): Promise<void> {
  const csv = [
    'Dossard;Prénom;Nom;Email;Distance;Adresse;Code postal;Ville',
    '1004;Camille;Bernard;camille.bernard@example.com;Marathon;4 rue Eugène Colas;14800;Deauville',
    '1005;Hugo;Petit;hugo.petit@example.com;Semi;;;',
    '1006;Chloé;Moreau;chloe.moreau@example.com;Semi;;;',
    '1007;Lucas;Laurent;lucas.laurent@example.com;Marathon;;;',
    '1008;Manon;Simon;manon.simon@example.com;Semi;;;',
  ].join('\n');
  await page.request.post('/org/deauville-2026/runners/import', { form: { step: 'confirm', csv }, maxRedirects: 0 });
  const appUser = async (bib: string, email: string, header: string): Promise<string> => {
    const res = await page.request.post('/api/auth/verify', { data: { raceSlug: 'deauville-2026', bib, email, code: '000000' } });
    const { token } = (await res.json()) as { token: string };
    await page.request.get('/api/me', { headers: { Authorization: `Bearer ${token}`, 'X-Sivoov-Client': header } });
    return token;
  };
  const camille = await appUser('1004', 'camille.bernard@example.com', 'app/2.0.0 (ios 18.2; iPhone)');
  await appUser('1006', 'chloe.moreau@example.com', 'app/2.0.0 (android 16; samsung SM-S911B)');
  await page.request.put('/api/runs/shots-run-1004', {
    headers: { Authorization: `Bearer ${camille}` },
    data: {
      run: {
        id: 'shots-run-1004', entrantId: 'deauville-2026-1004', courseId: 'deauville-2026-marathon', status: 'finished', source: 'app',
        startedAt: '2026-09-24T07:00:00+02:00', finishedAt: '2026-09-24T10:31:12+02:00', elapsedMs: 12_672_000, distanceM: 42_310, splits: [],
      },
    },
  });
}
