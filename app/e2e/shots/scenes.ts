import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Takes one frame. Called with no name it writes `<scene>.png`, otherwise `<scene>-<name>.png`. */
export type Shoot = (name?: string) => Promise<void>;

/**
 * The moments worth a picture. Add a scene here and it appears in every preset and in the
 * contact sheet; nothing else needs touching. See docs/SHOTS.md.
 */
export type Scene = {
  id: string;
  /** Caption in the contact sheet. English: this is a tooling surface, not a user surface. */
  title: string;
  /** Also taken at the store presets, which skip everything else. */
  store?: boolean;
  /** Starts from a signed-out context. */
  signedOut?: boolean;
  /** Drives the app to the moment, then calls `shoot` at each frame worth keeping. */
  go: (page: Page, shoot: Shoot) => Promise<void>;
};

const EMAIL = 'marc@example.com';
/** Marc and Léa are entered in two races (Deauville, the Champs-Élysées): the sign-in asks which. */
const RACE = 'deauville-2026';

/** Signed-in state is captured once by the setup project and reused; this is that capture. */
export const signIn = async (page: Page): Promise<void> => {
  await page.goto('/signin');
  await page.getByTestId('email').fill(EMAIL);
  await page.getByTestId('send').click();
  await page.getByTestId(`race-${RACE}`).click();
  await page.getByTestId('send').click();
  await expect(page.getByTestId('code')).toHaveValue(/\d{6}/, { timeout: 20_000 });
  await page.getByTestId('verify').click();
  await expect(page).toHaveURL(/home/);
};

/**
 * Fonts block the first frame, so they need no wait; images and the map PNG do. The last
 * pause lets Reanimated settle, otherwise a shot can catch a button mid-transition.
 */
export const settle = async (page: Page): Promise<void> => {
  await page
    .waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(300);
};

/**
 * A React Native ScrollView is an inner scrolling div, not the document, so Playwright's
 * `fullPage` sees nothing to extend: scroll the ScrollView itself. Several ancestors overflow
 * without being scrollable, so try the candidates tallest first and keep the one that moves.
 * Returns false when nothing moved — the screen already fitted, and a second frame would be a
 * copy of the first.
 */
export const scrollToEnd = async (page: Page): Promise<boolean> => {
  const scrolled = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('div'))
      .filter((d) => d.scrollHeight > d.clientHeight + 8 && /auto|scroll/.test(getComputedStyle(d).overflowY))
      .sort((a, b) => b.scrollHeight - a.scrollHeight);
    return candidates.some((el) => {
      const before = el.scrollTop;
      el.scrollTop = el.scrollHeight;
      return el.scrollTop > before + 8;
    });
  });
  if (scrolled) await page.waitForTimeout(400);
  return scrolled;
};

/** `seconds` of silence as an 8 kHz 8-bit mono WAV: a file the browser can load, time and end. */
const silentWav = (seconds: number): Buffer => {
  const samples = Math.round(seconds * 8000);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(8000, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, Buffer.alloc(samples, 128)]);
};

/**
 * The one thing the rig serves itself: the local stack has no rendered voice (ElevenLabs is
 * not reachable from it), so no course has a published pack. This one carries the Deauville
 * script's start ceremony as silent files: an intro, a ten-second countdown, the gun.
 */
const withCeremonyPack = async (page: Page): Promise<void> => {
  const files = { intro: silentWav(4), countdown: silentWav(10), gun: silentWav(2) };
  // Titles and captions as the Deauville script publishes them, so the ceremony's subtitles show.
  const lines = [
    { id: 'ceremony.intro', at: 'armed', key: 'intro', title: 'Présentation', caption: 'Bienvenue au Marathon International de Deauville ! Vous êtes sur la ligne de départ, face à la mer.' },
    { id: 'ceremony.countdown', at: 'countdown', key: 'countdown', title: 'Compte à rebours', caption: 'Dix. Neuf. Huit. Sept. Six. Cinq. Quatre. Trois. Deux. Un.' },
    { id: 'ceremony.gun', at: 'gun', key: 'gun', title: 'Le départ', caption: 'Partez ! Bonne course à toutes et à tous !' },
  ] as const;
  await page.route('**/shots-audio/*.wav', (route) => {
    const key = route.request().url().split('/').pop()!.replace('.wav', '') as keyof typeof files;
    return route.fulfill({ body: files[key], contentType: 'audio/wav' });
  });
  await page.route('**/api/courses/*/pack', (route) =>
    route.fulfill({
      json: {
        courseId: route.request().url().split('/').at(-2),
        version: 1,
        locale: 'fr',
        events: lines.map((l) => ({ id: l.id, title: l.title, caption: l.caption, trigger: { kind: 'cue', at: l.at, order: 1 }, source: { kind: 'file', key: `${l.key}.wav` }, mix: 'wait', priority: 10, category: 'ceremony', once: true })),
        files: Object.fromEntries(lines.map((l) => [`${l.key}.wav`, { url: `http://localhost:${process.env.SHOTS_API_PORT ?? '8788'}/shots-audio/${l.key}.wav`, bytes: files[l.key].length, sha256: 'silent' }])),
      },
    }),
  );
};

/**
 * The run screen's view for this scene. Headless Chromium draws the 3D map in software, which
 * slows an accelerated run about fifteen-fold: scenes that only need the numbers or the finish
 * take the numbers view. Set before the page loads, as the runner's own choice would be.
 */
export const withView = async (page: Page, view: 'follow' | 'overview' | 'numbers'): Promise<void> => {
  await page.addInitScript((v) => globalThis.localStorage?.setItem('sivoov.prefs', JSON.stringify({ voice: 'all', view: v })), view);
};

const openRun = async (page: Page, speed: number): Promise<void> => {
  await page.goto(`/run?sim=1&pace=5:00&noise=4&speed=${speed}`);
  await expect(page.getByTestId('sim-badge')).toBeVisible({ timeout: 20_000 });
};

export const scenes: Scene[] = [
  {
    id: 'signin',
    title: 'Sign-in — bib and email',
    signedOut: true,
    go: async (page, shoot) => {
      await page.goto('/signin');
      await expect(page.getByTestId('send')).toBeVisible();
      await shoot();
    },
  },
  {
    id: 'signin-code',
    title: 'Sign-in — the six-digit code',
    signedOut: true,
    go: async (page, shoot) => {
      await page.goto('/signin');
      // A different entrant from the one signIn() uses: codes are capped at 5 per hour each.
      await page.getByTestId('email').fill('lea@example.com');
      await page.getByTestId('send').click();
      // Léa's email holds two entries: the race picker, then the code.
      await expect(page.getByTestId(`race-${RACE}`)).toBeVisible({ timeout: 20_000 });
      await page.getByTestId(`race-${RACE}`).click();
      await shoot('race');
      await page.getByTestId('send').click();
      await expect(page.getByTestId('code')).toHaveValue(/\d{6}/, { timeout: 20_000 });
      await shoot();
    },
  },
  {
    id: 'home',
    title: 'Race home — your bib, your distance, the course',
    store: true,
    go: async (page, shoot) => {
      await page.goto('/home');
      await expect(page.getByTestId('bib-number')).toBeVisible({ timeout: 20_000 });
      // The Mapbox PNG, or the course diagram when the map cannot be fetched (offline, no token).
      await expect(page.getByTestId('course-map')).toBeVisible();
      await shoot();
      if (await scrollToEnd(page)) await shoot('bottom');
    },
  },
  {
    id: 'prepare',
    title: 'Pre-flight — GPS lock, permission, battery, headphones, audio pack',
    store: true,
    go: async (page, shoot) => {
      await withCeremonyPack(page);
      await page.goto('/prepare');
      // The GPS check is pending until a fix lands; the shot is only worth taking once it locks.
      await expect(page.getByTestId('go-start')).toBeEnabled({ timeout: 20_000 });
      await expect(page.getByTestId('check-pack')).toHaveAccessibleName(/: ok$/);
      await shoot();
    },
  },
  {
    id: 'run-ready',
    title: 'Run — ready, over the whole course (the map, or the course drawing without a token)',
    store: true,
    go: async (page, shoot) => {
      await openRun(page, 60);
      await expect(page.getByTestId('start')).toBeVisible();
      await page.waitForTimeout(3000);
      await shoot();
    },
  },
  {
    id: 'run-countdown',
    title: 'Run — the start ceremony: on the line, then the countdown file’s digits',
    go: async (page, shoot) => {
      // The device source (the rig grants a fixed position): simulation skips the ceremony.
      await withCeremonyPack(page);
      await page.goto('/run');
      // The map loads before the start, as it would at home on the phone.
      await expect(page.getByTestId('start')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(4000);
      await page.getByTestId('start').click();
      await expect(page.getByTestId('on-the-line')).toBeVisible({ timeout: 10_000 });
      // The speaker's words, written out under « Sur la ligne ».
      await expect(page.getByTestId('ceremony-caption')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(800);
      await shoot('line');
      // Into the ten-second countdown file: its digits, over the start line. The frame before
      // takes a few seconds with the map, so any digit but the last will do.
      await expect(page.getByTestId('countdown')).toHaveText(/^([2-9]|10)$/, { timeout: 15_000 });
      await shoot();
    },
  },
  {
    id: 'run-live',
    title: 'Run — live, past the first kilometre',
    store: true,
    go: async (page, shoot) => {
      await withView(page, 'follow');
      await openRun(page, 60);
      await page.getByTestId('start').click();
      // 1 km at 5:00/km is five minutes of race, five seconds at x60, a minute or two with the
      // map drawn in software. Either decimal separator: the same scene runs under `phone-en`,
      // where the number is formatted 1.15, not 1,15.
      await expect(page.getByTestId('distance')).toContainText(/^[1-9][.,]\d\d km$/, { timeout: 150_000 });
      // The audio line is the point of the product; wait for it, but never fail the shot on it.
      await page.getByTestId('now-playing').waitFor({ timeout: 5_000 }).catch(() => undefined);
      // The map's tiles and the camera's first move.
      await page.waitForTimeout(2500);
      await shoot();
    },
  },
  {
    id: 'run-controls',
    title: 'Run — the announcements and the voice level, the whole-course view, then hold to stop and confirm',
    go: async (page, shoot) => {
      await withView(page, 'follow');
      await openRun(page, 60);
      await page.getByTestId('start').click();
      // A few places passed, so the list has lines in it.
      await expect(page.getByTestId('distance')).toContainText(/^(0[.,][3-9]|[1-9][.,])\d+ km$/, { timeout: 150_000 });
      await page.getByTestId('open-announcements').click();
      await expect(page.getByTestId('announcements')).toBeVisible();
      await page.waitForTimeout(400);
      await shoot('announcements');
      await page.getByTestId('announcements-close').click();
      await expect(page.getByTestId('announcements')).toBeHidden();
      // The map's views, when the local Worker has a Mapbox token; the course drawing otherwise.
      if (await page.getByTestId('switch-view').isVisible()) {
        await page.getByTestId('switch-view').click();
        await page.waitForTimeout(2500);
        await shoot('overview');
        await page.getByTestId('switch-view').click();
        await page.getByTestId('switch-view').click();
      }
      // Hold to stop: the ring fills, then the confirmation. The run goes on under it.
      const stop = page.getByTestId('stop');
      await stop.hover();
      await page.mouse.down();
      await page.waitForTimeout(900);
      await shoot('holding');
      await page.waitForTimeout(900);
      await page.mouse.up();
      await expect(page.getByTestId('stop-confirm')).toBeVisible();
      await page.waitForTimeout(400);
      await shoot('confirm');
    },
  },
  {
    id: 'run-finished',
    title: 'Finish — the official time, share, then the splits',
    store: true,
    go: async (page, shoot) => {
      // The half at 5:00/km is 105 minutes of race: ~30 s of wall clock at x240, with the numbers view.
      await withView(page, 'numbers');
      await openRun(page, 240);
      await page.getByTestId('start').click();
      await expect(page.getByTestId('final-time')).toBeVisible({ timeout: 180_000 });
      await shoot();
      if (await scrollToEnd(page)) await shoot('splits');
    },
  },
  {
    id: 'diagnostics',
    title: 'Diagnostic — the device logbook, read without a cable',
    go: async (page, shoot) => {
      await page.goto('/debug');
      await shoot();
    },
  },
];
