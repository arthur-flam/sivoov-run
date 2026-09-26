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
- 2026-09-25: Hono's RegExpRouter does not group an alternation inside a route param. With
  `/:slug/settings/:section{race|window}` and `/:slug/settings/:slot{logo|hero}` mounted together,
  `POST /x/settings/logo/remove` ran the upload handler: the combined regex splits on the bare `|`.
  It only shows once several such routes share a prefix (a lone one works). Register one route
  per value instead (`SECTIONS.forEach((s) => app.post(`.../${s}`, ...))`, api/src/routes/orgRace.tsx).
- 2026-09-25: runners admin (list, runner page, add/edit/delete, two-step import, French downloads).
  - `all` is an SQL keyword: `SUM(...) AS all` is a syntax error in D1. Quote aliases built from
    a list (`AS "all"`).
  - workerd's `TextDecoder` does decode `windows-1252` (Excel on Windows writes it, curly
    apostrophe 0x92 included); verified in the workerd tests. `Response.text()` strips a leading
    BOM, so a test that wants to prove the BOM is there must read `arrayBuffer()`.
  - `sessions` has no index on `entrant_id`: the runner list aggregates sessions once per race in
    a CTE rather than per row.
  - The app sends `X-Sivoov-Client: app/<version> (<os> <version>; <model>)` on every API call,
    built from react-native `Platform` and expo-constants (no native module). A custom header
    needs its name in the `/api/*` CORS `allowHeaders`, or the web target's preflight fails.
  - "Instructions" emails sent from a runner's page are logged in R2 (`admin/instructions/<id>.json`),
    not in D1, so no migration was needed; that log backs the three-a-day limit.
  - `scripts/shots.sh` still runs `DELETE FROM organizer_codes`, a table 0006 dropped; with both
    statements in one `--command` the whole call fails, so `auth_codes` is no longer wiped
    between passes. The runner scenes sign in with TEST_CODE and issue no code, so they are fine.
- 2026-09-25: admin rebuild with five parallel worktree agents. For the next session that fans out:
  - Agent worktrees (`isolation: worktree`) were created from an old commit (`3d9b825`), not
    from the session's working branch. Every agent had to fast-forward to the branch first; say
    so in the brief, or the agent builds on a tree without the work it is meant to extend.
  - `cp -al <main>/node_modules ./node_modules` gives a worktree its dependencies in seconds and
    no disk: the workspace links inside are relative symlinks, so they resolve to the worktree's
    own `shared/`. A symlinked `node_modules` would resolve to the main checkout instead.
  - Parallel agents each ran `wrangler dev` on their own `--port` and `--inspector-port`; the
    local D1/R2 under `api/.wrangler/` is per worktree, so they never saw each other's data.
  - The merge cost was in the shared append points (end of `ui.tsx`, `adminStyles.ts`,
    `scenes.ts`, `emails.ts`, the shared barrels) and in two agents inventing the same component
    (`Choices`, `Pager`) with different props. Next time: name the components each agent may
    add, or give one agent the kit.
  - The screenshot rig's `DELETE FROM organizer_codes` (noted above) is fixed: it wipes
    `admin_codes` now.
  - `PW_CHROMIUM=/opt/pw-browsers/chromium` makes `api/playwright.shots.config.ts` use the
    container's Chromium; no throwaway config needed any more. In that browser cdnjs fails TLS
    (proxy CA), so Leaflet pages only show their SVG fallback in container screenshots.
  - Contrary to the 2026-09-12 note, `curl https://preview.run.sivoov.app` works from the cloud
    sandbox now (checked 2026-09-25): a session can verify a deploy itself.
  - deploy.yml now runs `wrangler d1 migrations apply` before `wrangler deploy` (preview and
    production). The Cloudflare token must be allowed to edit D1; if it is not, the deploy stops
    before the Worker, and the old Worker keeps serving the old schema.
- 2026-09-25: studio rework (plain-language audio admin, uploaded files). Worth knowing:
  - Event delegation with `closest('[data-role]')` stops at the first ancestor with any role,
    including display-only ones (`data-role="name"` inside a clickable row): the click lands on
    the label, not the button. Match only the action roles.
  - Moving a DOM node (appendChild into a new group) drops focus and the caret. The studio
    reorders cards after each save, so it moves only the cards whose place changed, then gives
    the focus and the selection range back.
  - Headless Chromium in the cloud container does not use the agent proxy, so cdnjs (Leaflet)
    fails while `curl` works. For a map-mode check, download the file with curl and serve it
    with `page.route(...).fulfill({ path })`; never turn TLS checks off.
  - `wrangler dev` does not pick up a changed `.dev.vars`: restart it.
  - A Playwright `fullPage` screenshot taken after a click (which scrolls the element into
    view) stitches the page around a sticky header. Scroll back to the top first (the
    `org-studio-edit` scene uses `page.mouse.wheel`, since the Worker tsconfig has no DOM lib).
  - A viewer page test that asserts a word is absent (`not.toContain('Réglages')`) also sees
    the inlined stylesheet and scripts: a French word in a CSS comment broke the dashboard test.
    Assert on elements (`/<button[^>]*data-role="publish"/`) rather than bare strings.
  - The seed (`api/tools/seed.ts`) upserts `courses.landmarks` and `courses.geometry_key`: now
    that organizers edit "Les lieux du parcours" and import their own GPX, a re-seed would
    overwrite both. Change the seed before running it on a race an organizer has worked on.
- 2026-09-25: review fixes (import, exports, team, organizers' form). Worth knowing:
  - A race between two requests can be tested in the workers pool: `Promise.all` of SELF.fetch
    calls interleaves their D1 awaits. Two requests interleaved about half the time; four
    owners stepping down at once broke the old JS-then-upsert check every run. The SQL guard
    (`KEEPS_AN_OWNER` in one UPDATE) is what holds; a check on a list read earlier does not.
  - A per-sender limit kept in one R2 JSON object (read, append, write) lets a burst through:
    every request reads "under the limit". The lead form writes one small object per post
    (`admin/leads-ip/<sha256(ip)>/<time>_<id>`), then lists the prefix: R2 lists are strongly
    consistent, so the Nth post to land always sees N. Same idea for the hourly staff-email cap
    in D1: insert first, count after.
  - `toCsv` writes a text cell starting with `= + - @`, a tab or a CR after an apostrophe (Excel
    shows it as text) and `parseEntrantsCsv` takes one apostrophe off, so downloads re-import
    unchanged. Numbers passed as numbers are left alone. Build rows with numbers as numbers.
  - The import's column names have two tiers: a generic "N°"/"Numéro"/"Name" counts only when no
    column says "Dossard"/"Bib"/"Last name". Add a new synonym to the right tier.
  - `SELF.fetch` in the api tests sends no `CF-Connecting-IP`; pass it by hand to test anything
    keyed on the sender's address.
- 2026-09-25: the GitHub `CLOUDFLARE_API_TOKEN` could deploy Workers but not use D1 (`code: 7403,
  The given account is not valid or is not authorized to access this service` from
  `wrangler d1 migrations apply --remote`). Deploying a Worker with a D1 binding does not need
  D1 rights; applying migrations does. The token needs Account, D1, Edit for deploy.yml's
  migration step. The failed step stopped the Worker deploy, as intended: preview kept the old
  Worker on the old schema instead of new code on missing tables.
- 2026-09-25: upload fallback (session 9). Things worth knowing next time:
  - A parallel-agent worktree can be cut from an older commit than the session branch it will
    merge into: this one started at `3d9b825` while `claude/running-app-launch-xopyvv` was eight
    commits ahead (`raceWindow.ts`, `official.ts`, the Chromium launcher all missing). Compare
    `git log` with the session branch first; with no local commits, `git merge --ff-only` fixes it.
  - A GPX has no accuracy and no Doppler speed, so the tracker runs on positions alone (default
    10 m accuracy, no ±15 % step bound, Kalman starts at v = 0). Measured on the simulated
    Deauville half at 1 Hz: the official time comes out 0.29 % fast at 3 m noise, 1.17 % at 5 m,
    3.40 % at 8 m (the app, with Doppler, is 0.23 % at 8 m). Watches smooth their output, so 3 m
    is the realistic row, but a noisy phone-app GPX is judged more generously than the app.
  - The other way round: on a clean 1 Hz track the 8 m jitter filter cuts Deauville's corners and
    measures 0.24 % short (21 047 m of 21 097.5). A runner who stops the watch the instant it
    shows the distance can be refused as tens of metres short. Owner's call: tolerance or override.
  - A synthetic file that ends exactly on the distance never finishes: the chords sum to
    9999.9999999 m of 10 000. Synthetic runs in tests go a little past the line, like real ones.
  - The tracker refuses steps above 10 m/s but keeps its last accepted fix, so a bus ride comes
    back later as one long step once (distance / time since that fix) drops under 10 m/s. Its
    kilometres then come out near 1:40. `evaluateUpload` refuses any kilometre under 2:10; the
    app does not check this at all.
  - World records moved in 2026 (marathon 1:59:30, half 56:51, 1000 m 2:11.83), so the
    too-fast thresholds are floors rounded down to the minute, not the records themselves.
  - A 1 Hz Garmin marathon GPX (heart rate + cadence) is 5.2 MB and ~16 000 points; reading and
    judging it costs 60-110 ms of CPU in Node. Fine on the Workers paid plan, far over the Free
    plan's 10 ms; which plan the account is on was not checked.
  - `api/src/lib/testCode.test.ts` is run by neither api vitest config (`test/**` in workerd,
    `tools/**` in node), so `npm test` does not run it.
  - `npm run shots` reuses whatever answers on :8788, which can be another worktree's Worker.
    With parallel sessions, start `wrangler dev --env local --port <free>` and run Playwright with
    a throwaway config spreading `playwright.shots.config.ts` with `webServer: undefined` and
    `use.baseURL` on that port.
- 2026-09-25: `Agent` with `isolation: worktree` branches from the local `main`, not from the
  session branch: two subagents started eight commits behind and one could not fast-forward
  (the auto-mode check refused it). For parallel work on a session branch, create the worktree
  yourself (`git worktree add .claude/worktrees/<name> -b <name> HEAD`) and point the agent at
  it; `.claude/worktrees/` is in `.git/info/exclude`.
- 2026-09-25: SQLite in workerd refuses an outer alias in the ORDER BY of a subquery that sits in
  a JOIN's ON clause (`no such column: ra.window_end`, then `e.race_id`), while a similar query
  ran fine through `wrangler d1 execute --local`. Test SQL in the workerd suite, not the CLI.
  `db/ranked.ts` looks the race window up by id, and `resultRows` binds the id (`?1`).
- 2026-09-25: the cloud container cannot reach Google Fonts: every page and share-card
  screenshot there renders in fallback fonts (a wide sans for Barlow Condensed). Judge spacing
  with that in mind; the real cards are narrower.
- 2026-09-25: Reanimated 4 is in package.json but `react-native-worklets` is not, so nothing may
  use Reanimated yet; any motion needs core `Animated` (native driver) until that is sorted.
- 2026-09-25: the owner has not committed to a visual identity and does not want design
  opinions shipped meanwhile: build new screens from the existing tokens and components, plain
  (DESIGN.md, "Until the identity is decided").
- 2026-09-25: leaving the run for home used `router.replace('/home')`, which stacks a second home
  over prepare and the first home. `router.dismissTo('/home')` goes back to the one that exists,
  and `useFocusEffect` there refreshes `/me`.
- 2026-09-25: start ceremony (session 9). Things worth knowing next time:
  - A sub-agent's worktree can be cut from `main` while the session branch is commits ahead:
    compare `git log main..<session branch>` before building on it.
  - expo-audio on the web: `onended` emits no status; `didJustFinish` arrives with the `pause`
    event the browser fires just before `ended`. Web statuses always say `isLoaded: true`;
    `duration` is 0 until the metadata is in. Statuses come from `timeupdate`, throttled to the
    player's `updateInterval` (500 ms unless `createAudioPlayer(src, { updateInterval })` says
    otherwise), and now carry an `error` string, set by the web `onerror`.
  - A status lags the sound by up to one update: the gun is dated `now - currentTime`, not `now`.
  - Headless Chromium loads and plays a silent WAV served by `page.route`, and reports its
    duration and position: that is how the rig and the ad-hoc e2e checks drive the ceremony
    with no rendered voice.
  - The pack store's retry keeps the pack and files it already has: `me` refreshes while a
    run is on screen (a flushed upload triggers it), and a reload that emptied the store then
    silenced the rest of the run. `usePackDownload` is keyed on the course id for the same reason.
- 2026-09-26: the reverse of the `.dev.vars` trap: on a laptop whose `api/.dev.vars` sets
  `MAPBOX_TOKEN`, two workerd tests fail that pass in CI (`api.test.ts` "renders the landing…"
  expects the SVG diagram, `results.test.ts` "answers 404 for the PNG…" expects no map). The
  pool loads `.dev.vars` ("Using secrets defined in .dev.vars"), so a test that needs a binding
  *absent* has to blank it in `miniflare.bindings` too. Fixed: `api/vitest.config.ts` sets
  `MAPBOX_TOKEN` and `BROWSER_RENDERING_TOKEN` to `''`, and the suite passes with and without
  the laptop's `.dev.vars`. The pool has no switch to skip `.dev.vars` (it calls
  `unstable_getMiniflareWorkerOptions` without `envFiles`), and a key can be overridden but not
  removed, so a blank value is the way. That makes '' mean "no secret" in the Worker: two reads
  used `?? null` and passed '' on as a token (the run page drew an empty Leaflet box); they use
  `|| null` now. Read an optional secret with a truthiness check, never `??`. A test that needs
  a token sets its own, in the config or in the deps it passes.
- 2026-09-26: the stored run status says `finished` for a rehearsal too. Anything that shows
  whether a run counts must go through `rankedRun` (SQL) or `runVerdict`/`isRanked` (shared),
  never `status` alone: the admin badge did, and read "Arrivé" for runs the export excluded.
- 2026-09-26: a PR title with double quotes failed both EAS publishes (`Unexpected argument`):
  the workflows pasted `head_commit.message` and `pull_request.title` into the command. In a
  `run:` step, pass event text through `env:` and quote the variable. The `preview` action runs
  its `command` input itself (no shell, so no `$VAR`), which is why `preview.yml` strips quotes
  from the title in a step before it. Never put `${{ github.event.* }}` text inside a script.
