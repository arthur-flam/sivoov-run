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
