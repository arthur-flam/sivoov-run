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

const BIB = '1001';
const EMAIL = 'marc@example.com';

/** Signed-in state is captured once by the setup project and reused; this is that capture. */
export const signIn = async (page: Page): Promise<void> => {
  await page.goto('/signin');
  await page.getByTestId('bib').fill(BIB);
  await page.getByTestId('email').fill(EMAIL);
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
  const lines = [
    { id: 'ceremony.intro', at: 'armed', key: 'intro' },
    { id: 'ceremony.countdown', at: 'countdown', key: 'countdown' },
    { id: 'ceremony.gun', at: 'gun', key: 'gun' },
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
        events: lines.map((l) => ({ id: l.id, trigger: { kind: 'cue', at: l.at, order: 1 }, source: { kind: 'file', key: `${l.key}.wav` }, mix: 'wait', priority: 10, category: 'ceremony', once: true })),
        files: Object.fromEntries(lines.map((l) => [`${l.key}.wav`, { url: `http://localhost:8788/shots-audio/${l.key}.wav`, bytes: files[l.key].length, sha256: 'silent' }])),
      },
    }),
  );
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
      await page.getByTestId('bib').fill('1002');
      await page.getByTestId('email').fill('lea@example.com');
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
    title: 'Run — ready, with the course diagram',
    store: true,
    go: async (page, shoot) => {
      await openRun(page, 60);
      await expect(page.getByTestId('start')).toBeVisible();
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
      await page.getByTestId('start').click();
      await expect(page.getByTestId('on-the-line')).toBeVisible({ timeout: 10_000 });
      await shoot('line');
      // Two seconds into the ten-second countdown file: the digit reads 8.
      await expect(page.getByTestId('countdown')).toHaveText('8', { timeout: 15_000 });
      await shoot();
    },
  },
  {
    id: 'run-live',
    title: 'Run — live, past the first kilometre',
    store: true,
    go: async (page, shoot) => {
      await openRun(page, 60);
      await page.getByTestId('start').click();
      // 2 km at 5:00/km is ten minutes of race, ten seconds at x60. Either decimal separator:
      // the same scene runs under `phone-en`, where the number is formatted 1.15, not 1,15.
      await expect(page.getByTestId('distance')).toContainText(/^[1-9][.,]\d\d km$/, { timeout: 60_000 });
      // The audio line is the point of the product; wait for it, but never fail the shot on it.
      await page.getByTestId('now-playing').waitFor({ timeout: 5_000 }).catch(() => undefined);
      await shoot();
    },
  },
  {
    id: 'run-finished',
    title: 'Finish — the medal, the official time, share, then the splits',
    store: true,
    go: async (page, shoot) => {
      // The half at 5:00/km is 105 minutes of race: ~30 s of wall clock at x240.
      await openRun(page, 240);
      await page.getByTestId('start').click();
      await expect(page.getByTestId('final-time')).toBeVisible({ timeout: 180_000 });
      // The medal lands on a spring: let it settle before the picture.
      await expect(page.getByTestId('medal')).toBeVisible();
      await page.waitForTimeout(900);
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
