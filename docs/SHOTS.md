# Screenshots

One headless command photographs every key screen of the app and every server-rendered page,
at whatever sizes you ask for, and lays them out on a contact sheet.

```bash
npm run shots            # the design loop: app at `phone`, plus the web pages. ~70 s.
npm run shots:store      # App Store and Play Store sizes, store scenes only. ~60 s.
```

Everything lands in `docs/shots/<preset>/<scene>.png`, with `docs/shots/index.html` as the
contact sheet — open that to review a design change in one look. The folder is gitignored:
these are generated, and the reviewable artefact is the sheet or the files you send.

## What it drives

Nothing is mocked but the audio pack. The rig starts the local Worker and the Expo web target, migrates and
seeds the local D1, signs in as a real seeded entrant, and runs a **simulated half marathon
at ×240** so the finish screen and the splits are real output, not a fixture. A full pass is
about seventy seconds. The local stack has no rendered voice, so the `prepare` and
`run-countdown` scenes serve a pack of silent WAVs carrying the start ceremony
(`withCeremonyPack` in `app/e2e/shots/scenes.ts`); `run-countdown` uses the device source
because simulation skips the ceremony.

## Options

```bash
npm run shots -- --app             # app screens only
npm run shots -- --web             # server-rendered pages only
npm run shots -- --all             # every app preset, French and English
npm run shots -- run-live home     # only the scenes whose name matches
npm run shots -- --presets phone-en
```

## Presets

| Preset | Viewport | File size | For |
|---|---|---|---|
| `phone` | 390×844 @2 | 780×1688 | the design loop (default) |
| `phone-en` | 390×844 @2 | 780×1688 | the English copy |
| `store-ios` | 430×932 @3 | **1290×2796** | App Store, 6.9" iPhone slot |
| `store-android` | 360×640 @3 | **1080×1920** | Play Store, phone |
| `web-mobile` | 390×844 @2 | full page | the pages on a phone |
| `web-desktop` | 1280×900 @2 | full page | the pages on a laptop |

Store presets take only the scenes marked `store` in the scene list, always at the exact
viewport pixel size (never a full-page capture — the stores reject the wrong dimensions), and
they hide the simulation badge and the dev-only run link so nothing internal ships to Apple.

## Adding a shot

Add a scene to `app/e2e/shots/scenes.ts` (or `api/e2e/shots/scenes.ts` for a page). A scene
drives the app to a moment and calls `shoot()` at each frame worth keeping; a second call
with a name writes `<scene>-<name>.png`. Nothing else needs touching — the preset matrix and
the contact sheet pick it up.

```ts
{
  id: 'run-live',
  title: 'Run — live, past the first kilometre',
  store: true,
  go: async (page, shoot) => {
    await page.goto('/run?sim=1&pace=5:00&speed=60');
    await page.getByTestId('start').click();
    await expect(page.getByTestId('distance')).toContainText(/^[1-9],\d\d km$/);
    await shoot();
  },
}
```

## Gotchas

- **`fullPage` does nothing in the app.** A React Native `ScrollView` is an inner scrolling
  div, not the document, so Playwright has nothing to extend. Use the `scrollToEnd(page)`
  helper and take a second frame. On the web pages `fullPage` works normally and is the default.
- **Sign-in codes are capped at five per hour per entrant.** The runner wipes `auth_codes` and
  `organizer_codes` in the local D1 before every pass, and the scenes are spread over the three
  seeded entrants, so a repeated run never trips the limit.
- **This is a camera, not a test suite.** `npm run shots` is not part of CI and never gates a
  push; `npm run e2e` still owns the assertions. The two are kept apart on purpose:
  `playwright.shots.config.ts` alongside `playwright.config.ts`, which ignores `e2e/shots/`.
- **What it cannot see.** It runs the web target in Chromium: no real GPS, no background
  service, no lock screen, no iOS. Device truth still comes from `docs/DEVICE.md`.

## App Store screenshots

`npm run shots:store` produces correctly sized, dev-chrome-free captures of the five scenes
marked `store`. Apple and Google both accept plain screenshots at these dimensions, so these
files can be uploaded as they are. If marketing later wants framed shots with captions, that
is a layer on top of these files, not a change to the rig.
