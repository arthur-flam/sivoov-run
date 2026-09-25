# Memory (append-only)

- 2026-09-12: Previous repo (`arthur-flam/sivoov`) drifted: CLAUDE.md pointed at folders
  that did not exist and referenced docs that were never written. Cost: every session started
  wrong. Rule here: STATUS.md is updated at the end of every session, no exceptions.
- 2026-09-12: In the previous app, virtual runs were a flag on a 1000-line run screen that
  swapped in a debug mock-location adapter. Lesson: the location source is an interface from
  day one (device, simulation, replay), and the run screen does not know which one it has.
- 2026-09-12: Kalman smoothing on distance (not only on lat/lon) is what made splits stable.
- 2026-09-12: Expo SDK is 57 (React Native 0.86) as of June 2026. Pin the SDK, upgrade only
  between milestones.
- 2026-09-12: Simulating GPS with white noise per fix makes every distance filter look broken
  (raw distance inflates 100%+ at 8 m). Real receivers drift slowly. The simulator uses an
  AR(1) offset (correlation 0.98/s) and the tracker bounds each step by the Doppler speed
  (±15%); with that, distance is within ~1% at 8 m noise. Tune against a real trace before
  trusting any number.
- 2026-09-12: `@cloudflare/vitest-pool-workers` 0.22 (vitest 4) dropped `defineWorkersConfig`:
  use the `cloudflareTest()` Vite plugin from the package root, and augment
  `Cloudflare.Env` (not `ProvidedEnv`) for test bindings. `readD1Migrations` still exists.
- 2026-09-12: workerd lags Cloudflare's compatibility dates by a couple of weeks; a
  `compatibility_date` newer than the installed binary makes every test fail at startup.
- 2026-09-12: Two-level custom domains (`preview.run.sivoov.app`) get their certificate a few
  minutes after `wrangler deploy`; TLS handshake failures right after a first deploy are not
  a config bug. From the cloud sandbox, `curl` to the deployed hosts is blocked
  (EHOSTUNREACH); verify with `--resolve` or from the phone.
- 2026-09-12: Node cannot run the shared package directly (`--experimental-strip-types`
  needs explicit extensions, JSON imports need attributes). Tools run with `tsx`, and
  fixtures are `.ts` modules, not `.json`, so Metro, Vite and workerd all agree.
- 2026-09-12: A simulation LocationSource must expose one clock for its whole life:
  the countdown, the gun (`startRun(now)`) and the fixes all read it. Resetting the clock in
  `start()` shifted every elapsed time by the countdown length.
- 2026-09-13: Cloudflare Email Sending replaced Resend: the `send_email` binding needs no key,
  the zone `sivoov.app` is onboarded (`wrangler email sending list`). `from.email` must be on
  that zone. The binding is absent in workerd tests, so `mailerFor` falls back to the console.
- 2026-09-13: A fixed test code (`TEST_CODE` var, local and preview) is accepted only for
  `@example.com` accounts. Tests that need a "wrong" code must not use `000000`.
- 2026-09-13: Mapbox in the app without a native module: the Worker renders a Static Images
  PNG (`/api/courses/:id/map.png`, token as a Worker secret, cached in `caches.default`) and
  the app shows it with `Image`. Encoded polyline, thinned to 300 points, keeps the URL short.
- 2026-09-13: `TaskManager.defineTask` executors must be `async` (SDK 57 typings) and the task
  must be defined at module top level before any screen starts updates; `_layout.tsx` imports
  `services/location/device.ts` for that.
- 2026-09-13: The pending-upload queue persists through `storage.ts` (SecureStore on device).
  A full-marathon trace (~1 MB) is too big for SecureStore: before Deauville, move the trace body
  to expo-file-system and keep only the run plus a file path in SecureStore.
- 2026-09-13: Android 11+ cannot show the "always" location prompt inline;
  `requestBackgroundPermissionsAsync` sends the runner to settings. The pre-flight keeps the
  start button disabled until they come back with "Toujours".
- 2026-09-13: The `ELEVENLABS_API_TOKEN` in `.env` is TTS-only (`/v1/voices` and `/v1/user`
  return 401 `missing_permissions`); the plan allows 2 concurrent requests (429 above).
  `api/tools/audio/tts.ts` defaults to 2 with retry, `ELEVENLABS_CONCURRENCY` overrides.
- 2026-09-13: `api/vitest.config.ts` only runs `test/**` in the workerd pool; node-side tools
  (`api/tools/**/*.test.ts`) run under `api/vitest.tools.config.ts`. `npm test -w api` runs both.
- 2026-09-13: `audio_packs` was already in `0001_init.sql` (unique on course, version, locale);
  pack row id is `<courseId>/<version>/<locale>`. `wrangler d1 migrations apply` picks up every
  unapplied file, so a half-finished migration from a parallel agent lands too.
- 2026-09-13: Hono: `/org` must be mounted before the pages router, or `/:slug` swallows it. A
  helper taking the context is typed `Context<AppEnv & { Variables: OrgVars }>`; deriving it from
  `Parameters<typeof app.get>` collapses to `never`.
- 2026-09-13: Shell heredocs turn `﻿` into a literal BOM in source files; eslint's
  `no-irregular-whitespace` catches it only in regexes. Write the escape explicitly.
- 2026-09-13: The auto-mode permission classifier blocked production D1 migration and deploy
  from this session (preview went through). Production catch-up is a laptop/interactive step.
- 2026-09-13: Pending-upload traces are files now (`app/src/stores/traceFiles.ts`, expo-file-system
  `Paths.document/traces/<runId>.json`); SecureStore holds `{ run, tracePath, ... }` only. Hydrate
  drops an entry whose file is missing or fails `RunTraceSchema`, so a corrupt file loses one run
  rather than the whole queue. On web the "path" is a localStorage key `sivoov.trace.<runId>`.
- 2026-09-13: The dev shell does not need EAS. The laptop has the Android SDK (`~/Library/Android/sdk`,
  platform 35/36, NDK 27) and JDK 17, so `expo prebuild` + `gradlew assembleDebug` builds and
  installs `com.arthur.flam.sivoov.dev` over a USB cable. `scripts/device.sh` wraps it and
  `docs/DEVICE.md` is the runbook. EAS Build stays the path for iOS, shareable links and stores.
- 2026-09-13: `wrangler d1 execute --command` fails when the SQL string contains newlines; pass
  it on one line (`api/tools/trace-pull.ts`). `--file` takes multi-line SQL fine (`seed.ts`).
- 2026-09-13: `/prepare` disables the start button until the permission is `always`, and Android
  only offers "always" from the system settings page. Without a way out of the screen that is a
  dead end on a real phone, so the screen now shows "Ouvrir les réglages" (`Linking.openSettings`)
  whenever the permission check is a warning.
- 2026-09-13: The race window (9-15 Nov 2026) is displayed but never enforced: a test run outside
  it starts and uploads normally. Worth remembering before assuming a date gate exists.
- 2026-09-13: The first Android build took 46 min because RN compiles all four ABIs by default.
  Phones are arm64: `ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a` (set in
  `scripts/device.sh`, `ANDROID_ABIS` overrides) survives `expo prebuild`, which rewrites
  `android/gradle.properties`. Editing that file directly does not survive.
- 2026-09-13: **Android crashed seconds into every run** until `RECEIVE_BOOT_COMPLETED` was added
  to `android.permissions`. `expo-task-manager` delivers background location batches through a
  JobScheduler job created with `.setPersisted(true)` (`TaskManagerUtils.java:205`) and registers
  a `BOOT_COMPLETED` receiver, but neither expo-task-manager nor expo-location declares the
  permission — Android then throws `IllegalArgumentException: Requested job cannot be persisted`
  from inside `TaskBroadcastReceiver`, which is fatal and unreachable from JS, so no try/catch in
  the app could have saved it. Found in 20 minutes on a real phone; invisible on the web target
  and to every test. Any Expo app doing background location needs this permission.
- 2026-09-13: Permissions on a test phone need no tapping: `adb shell pm grant <pkg>
  android.permission.ACCESS_BACKGROUND_LOCATION` grants the "always" location that Android
  otherwise only offers from its settings page, and `adb shell dumpsys deviceidle whitelist +<pkg>`
  buys the battery exemption Samsung needs. Both are `./scripts/device.sh prep`.
- 2026-09-13: A stationary phone records nothing: Android logs `FusedLocation: stationary
  throttling engaged` and the location batches arrive empty, so an indoor desk test shows
  `0 GPS · 0 rejected` on the finish screen even though the whole pipeline is healthy. Confirmed
  with Arthur that the phone was not moving. Test the tracker by walking, never from a desk.
- 2026-09-13: Metro's file watcher did not fire all session — Fast Refresh never rebundled an
  edited file and changes only appeared after `adb shell am force-stop` plus a relaunch. Verify
  an edit actually landed (change something visible) before concluding it had no effect.
- 2026-09-13: `expo start` forwards the device's console output to its own stdout only after the
  app reconnects; a dev-client launched by deep link while the process is still dying crashes
  with `App react context shouldn't be created before` (DevLauncherAppLoader). Force-stop, wait,
  then launch with the plain LAUNCHER intent.
- 2026-09-13: Playwright's `fullPage: true` is a no-op on the app's web target. A React Native
  `ScrollView` renders as an inner scrolling div, so the document never grows and the capture is
  just the viewport — silently, with no error. `scrollToEnd()` in `app/e2e/shots/scenes.ts`
  scrolls the ScrollView instead, and only the candidates whose `overflowY` is auto/scroll *and*
  whose `scrollTop` actually moves: several RN wrappers overflow by a few pixels without being
  scrollable, and scrolling those writes a second frame identical to the first. `fullPage` works
  normally on the server-rendered pages, which are ordinary documents.
- 2026-09-13: Sign-in codes are capped at 5 per hour per entrant (`MAX_CODES_PER_HOUR`), which
  any tool that signs in repeatedly will hit within two runs. `scripts/shots.sh` wipes
  `auth_codes` and `organizer_codes` from the local D1 before every pass and spreads its
  sign-ins over the three seeded entrants.
- 2026-09-13: The Expo web target reports `__DEV__` true, so the dev-only simulation link on the
  race home and the "Simulation" badges on the run screen appear in every screenshot. They carry
  testIDs (`dev-sim-link`, `sim-badge`, `sim-badge-live`) purely so the store presets can hide
  them; anything else dev-only that lands on a screen needs a testID and a line in `DEV_CHROME`
  in `app/e2e/shots/shots.spec.ts`, or it ships to Apple.
- 2026-09-13: Every GitHub Actions run since the first commit had failed, unnoticed. Two
  independent causes: `api`'s typecheck needs `worker-configuration.d.ts`, which `wrangler types`
  generates and `.gitignore` excludes, so CI never had it (`typecheck` now generates it first);
  and the repo has **no Actions secrets at all**, so every `eas update` and every `wrangler deploy`
  died on a missing token. Both workflows now warn and skip instead of failing when a secret is
  absent — a red run means a real breakage again.
- 2026-09-13: A debug dev client carries no JS bundle: with metro off it is a red screen, so
  `Sivoov (Dev)` can never leave the house. The shell that can is a release build
  (`npm run device:preview`), where the bundle is inside the APK and expo-updates is live.
- 2026-09-13: `eas.json`'s `channel` is stamped into the binary by EAS Build and by nothing else.
  A shell compiled on the laptop asks for no channel and would never see an update, so
  `app.config.ts` sets `updates.requestHeaders['expo-channel-name']` from `APP_VARIANT` itself.
- 2026-09-13: expo-updates with `fallbackToCacheTimeout: 0` launches from cache and downloads in
  the background, so a new update runs only at the *next* launch — two starts. The Diagnostic
  screen's "Chercher une mise à jour" does check + fetch + reload in one tap, which is what you
  want when the fix is being tested on a street corner.
- 2026-09-13: `./gradlew assembleRelease` dies at `lintVitalAnalyzeRelease` with `Metaspace` on
  this laptop — a release-only lint gate, nine minutes in, after everything useful is compiled.
  `scripts/device.sh preview` skips it (`-x lintVitalAnalyzeRelease -x lintVitalReportRelease`)
  and raises the daemon's heap. Also note gradle failing does not by itself make the wrapper
  loud: check for `BUILD SUCCESSFUL` and for the `adb install` line, not just an exit code.
- 2026-09-13: `fetchMock` from `cloudflare:test` does **not** exist in
  `@cloudflare/vitest-pool-workers@0.22`: the undici mock types are shipped but nothing exports
  the agent. The worker under test shares the test isolate (the pool's own docs say global mocks
  apply to it), so stubbing `globalThis.fetch` in `beforeAll` and restoring it in `afterAll` is
  the way to fake a provider — and counting the calls is how you prove an R2 cache actually hit.
- 2026-09-13: a wrangler `rules` entry (`{"type":"Text","globs":["**/*.client.js"]}`) is enough
  to import a real browser `.js` file as a string, in `wrangler dev` and in the workerd tests
  alike; `wrangler types` then declares `*.js` as text for the whole project. Lint it by adding
  a `files: ['**/*.client.js']` block with browser globals — and note the repo's `no-var` rule
  applies there too, so old-school IIFE style has to use const/let.
- 2026-09-13: Leaflet markers and polylines swallow map clicks. A course drawn with 42 faint
  split markers and an interactive polyline never fires `map.on('click')` — every click lands on
  a layer. `interactive: false` on the line, the km ticks and the repeated occurrences (which
  have nothing to select) gives the map its clicks back. Tooltips need interactivity, so a
  non-interactive tick cannot carry one.
- 2026-09-13: nearest-point-on-course is ambiguous on a real course: 100 m north of Deauville's
  km 5 is nearer to km 26, because the course loops back. Any "click the map to place an event"
  UI has to show the distance it found (the studio puts it in the popup) rather than silently
  trusting the projection. A test asserting a metre-accurate projection needs a straight
  synthetic track, not the race GPX.
- 2026-09-13: organizer screenshot scenes should take their session with one form post of
  `TEST_CODE` (`page.request.post` shares the browser context's cookies) instead of walking the
  email-code form: `MAX_CODES_PER_HOUR` is 5 per organizer and there is only one `@example.com`
  organizer, so four scenes across two presets is already over the cap.
- 2026-09-13: A workerd test that passes locally and fails in CI with a 503 is usually a binding
  read from `api/.dev.vars` (gitignored). The vitest pool gets its own values in
  `api/vitest.config.ts` (`miniflare.bindings`); never rely on `.dev.vars` in a test.
- 2026-09-23: pre-field-test review fixes. Things worth knowing next time:
  - The tracker drops any fix timestamped before the gun. Android's fused provider hands over
    a cached last-known fix when updates start; anchoring on it added the walk to the start
    line as race distance. It relies on the phone clock and the GPS clock agreeing to within a
    second or so; a phone clock far ahead would drop the first fixes (a few meters lost).
  - `abandon()` now yields phase `'abandoned'`, and the server re-derives the status anyway
    (`officialStatus` in `shared/`): 'finished' only for a non-simulation run that covered the
    course distance. Simulated runs are stored, never ranked.
  - A zustand store method that `await`s a countdown outlives the screen that called it. The
    run store bumps a generation counter in `reset()` so a start still counting down gives up
    instead of switching background GPS on after the screen is gone.
  - Effects keyed on objects from async stores (the audio pack) re-run when the object is
    replaced; never put a destructive cleanup (`reset()`) on such an effect.
  - expo-audio reports no load error: a player whose URI cannot load just never sends
    `didJustFinish`. The event player has a watchdog (8 s to load, duration + 3 s to finish).
  - `fetch` in React Native has no read timeout. Every API call now aborts (20 s, 120 s for a
    run upload).
  - `BackHandler` on the web target shows a LogBox "not supported" toast: register it on
    Android only.
  - `npm run shots` in a cloud container fails: the pinned Playwright wants a newer headless
    shell than `/opt/pw-browsers` holds. A throwaway config spreading the real one with
    `use.launchOptions.executablePath = '/opt/pw-browsers/chromium'` runs it. The home scene
    still fails there because the Mapbox map PNG cannot be fetched from the container.
- 2026-09-23: `expo/expo-github-action/preview@v8` rejects `qr-target: dev-build` ("Invalid QR code
  target: dev-build, expected expo-go or dev-build"): its input check only lists `dev-client`,
  which it maps to dev-build. Use `dev-client`. The preview workflow had never run before PR #1.
- 2026-09-25: public pages and /organisateurs. Things worth knowing next time:
  - `Intl.DateTimeFormat.formatRange` joins "14" and "15 novembre 2026" with an en dash
    (U+2013), which the copy rules forbid. `fmtRaceDays` / `fmtSpan` in `api/src/pages/dates.ts`
    build "14 et 15 novembre 2026" and "du 9 au 15 novembre" from the dictionary instead.
  - A race's `dateStart`/`dateEnd` are ISO dates (midnight UTC once parsed): format them in UTC,
    not in the race timezone, or every race west of Greenwich shows the day before.
  - `/organisateurs` is its own router (`api/src/routes/organizers.tsx`) mounted before the pages,
    like `/org`; `localeOf` moved to `api/src/routes/locale.ts` so both routers share it.
  - The lead form is a public form that mails staff: a hidden `website` field (bots fill it, the
    lead is thanked and dropped) and five leads per email per day. The staff mail is plain text
    only, since every field in it was typed by a stranger.
  - Workerd tests can assert on mail: the console mailer logs synchronously when `send` is
    called, so `vi.spyOn(console, 'log')` sees the `[mail] to=...` lines before the response
    returns (see `api/test/public.test.ts`).
  - A thrown-together screenshot script that splits `name=path` on `=` silently drops
    `?lang=en` and photographs the French page. Split on the first `=` only.
