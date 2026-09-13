# Status

Updated: 2026-09-13 (session 7: audio experience brief + organizer studio; session 6: the no-laptop loop; session 5: the screenshot rig; session 4: phone testing on Android over USB; session 3: trace storage;
session 2: email, access, map, audio, device, admin; production deployed). Race week: 14-15 November 2026.
See PRD section 8 for milestones.

## Where we are: M1 done bar the moving tracker
Live: https://run.sivoov.app/deauville-2026 (production) and https://preview.run.sivoov.app
(preview). How to sign in as a test runner or organizer on local/preview: `docs/ACCESS.md`.
Production has the race and courses, no entrants yet.

| Slice | State |
|---|---|
| 1. `shared/` schemas + domain | Done. 51 tests. Tracker holds ~1% distance error at 8 m simulated noise. |
| 2. `api/` Worker, D1, auth, pages | Done and deployed. Sign-in codes go out through Cloudflare Email Sending (`EMAIL` binding, zone sivoov.app); local/preview also accept the fixed test code for @example.com accounts. Landing page shows the real course on a Mapbox static map (`/api/courses/:id/map.png`). |
| 3. `app/` sign-in, home, run (simulation) | Done on the web target: Playwright signs in and runs a simulated half at ×60. Home shows the course map (Mapbox PNG via the Worker). |
| 4. Native shell on Android | Built locally, no EAS: the laptop has the Android SDK and JDK 17, so `npm run device:build` prebuilds and installs `Sivoov (Dev)` (`com.arthur.flam.sivoov.dev`, pointed at preview) over a USB cable. Runbook: `docs/DEVICE.md`, wrapper: `scripts/device.sh`. `eas.json` still stands for iOS, shareable links and the store builds. |
| 5. Audio pack v0 | Done, and **heard on a phone** 2026-09-13. `api/tools/audio/` (typed French script → ElevenLabs → R2 → `audio_packs`), `npm run audio:build -w api -- <env>`. Pack `deauville-2026-marathon/1/fr` (13 events, 12 MP3, 1.85 MB) is in preview and production R2 + D1. `GET /api/courses/:id/pack` and `/api/packs/...` serve it; the app downloads it (expo-file-system) and plays it with expo-audio (background, ducking, mix/priority queue). Km splits are caption-only. |
| 6. Device slice | Done on the web target. Background location (expo-task-manager task, Android foreground service, "always" flow), `/prepare` pre-flight (GPS lock, permission, battery, headphones), finish uploads `PUT /api/runs/:id` + trace to R2, offline queue persisted and retried on foreground. Exercised on a Galaxy S23 on 2026-09-13: foreground service, audio, finish and upload all real; the tracker has still never seen a moving runner. |
| 7. Organizer admin | Done and on preview: `/org/deauville-2026` (email code sign-in, counts, entrant list with search, CSV import idempotent on bib with a rejection report, entrants/results CSV exports), CLI `npm run import:entrants -w api -- <env> <file.csv>`. 6 workerd tests, Playwright screenshots. |
| 9. The no-laptop loop | Done, and **proven on the phone** 2026-09-13. `Sivoov (Preview)` is a standalone release shell (`npm run device:preview`) that needs no metro: the bundle is in the APK and `expo-updates` is live on the `preview` channel, so a cloud session ships JS with `gh workflow run deploy.yml -f action=publish-preview`. The app keeps a device logbook (`app/src/diag.ts`) replacing `adb logcat`: read it on the phone (finish screen → Diagnostic, with Share), or from a session — it rides to R2 in the run's trace and `npm run trace:pull` prints it. CI typecheck and a too-tight workerd timeout fixed: CI and Deploy are **green for the first time since the repo began**, and Arthur created the three Actions secrets, so main now deploys the preview Worker and publishes the update by itself. |
| 10. Organizer studio (courses, GPX, audio script on a map) | Done, on preview (migration + seed + secret applied 2026-09-13; the Worker deploys from main). `/org/{race}/courses` (cards per course: trace, repères, brouillon, pack; GPX upload) and `/org/{race}/courses/{courseId}` — the studio: Leaflet + Mapbox tiles, one marker per audio event at its projected distance, click the course to add one there, target pace turning `elapsed`/`split` into positions, distance frise, per-event editor with autosave, `Écouter` (MP3 or browser voice), `Générer la voix` (ElevenLabs from the Worker, R2 cache at `tts/<hash>.mp3`), `Publier la version N` (pack + manifest + `audio_packs`, draft bumped). Migration `0005_audio_scripts`. 13 workerd tests, two new screenshots. The CLI (`npm run audio:build`) still works on the same shared schema. |
| 8. Screenshot rig | Done. `npm run shots` photographs 9 app screens and 8 web pages headlessly in ~70 s into `docs/shots/` with a contact sheet; `npm run shots:store` writes exact App Store (1290x2796) and Play (1080x1920) files with the dev chrome hidden. Presets include an English pass. Runbook: `docs/SHOTS.md`. |

## Start here (next session)
1. Read this file, `docs/WORKFLOW.md` (loop 2b), `docs/MEMORY.md`.
2. **No laptop?** That is now the supported case. `Sivoov (Preview)` on the phone is standalone;
   ship JS with `gh workflow run deploy.yml -f action=publish-preview` and pull it on the phone
   with Diagnostic → *Chercher une mise à jour*. Read what happened with
   `npm run trace:pull -w api -- preview <run-id>`, which prints the device logbook.
   Verified end to end on 2026-09-13: a push to main published update `01a09c31` to the
   `preview` channel, and the Galaxy S23 downloaded it over 4G (`NEW_UPDATE_LOADED`) and ran
   it on the next launch, with the cable used for nothing.
3. **Laptop at hand?** `npm run device:doctor`, then `npm run device` is still the fastest loop,
   but `android/` now holds the preview package: the dev client costs one `npm run device:build`.
4. First task, either way: **the walk test** in item 1. Five minutes, and it unblocks M2.

Note for the next session: Metro's file watcher did not fire during session 4, so edits only
landed after `adb shell am force-stop com.arthur.flam.sivoov.dev` and a relaunch. Check whether
that reproduces before assuming an edit had no effect.

## Next, in order (the pipe)
Anchored to PRD section 8. Today is 2026-09-13: **M1 is due 26 Sep, M2 10 Oct, M3 17 Oct**, and
PRD says App Store review is the critical path.

M1 is effectively done — the last clause of it, "the app shell runs a race end to end in the
dev client", happened on 2026-09-13 on a real Galaxy S23 (see below), minus the moving tracker.

### M2 (10 Oct): a real run on a device, results, upload fallback
1. **The walk test — the one thing blocking everything else.** Two indoor runs recorded
   **0 GPS · 0 rejected**: nothing reached the tracker, while the native side logged location
   batches every few seconds. Arthur has confirmed the phone was stationary throughout, and
   Android logged `FusedLocation: stationary throttling engaged`, so empty batches are the
   likely and innocent explanation — but it is still *unverified*, and the alternative is that
   the JS task never receives the fixes (the dev client warns `No task registered for key
   expo-task-manager` on every start, which would do exactly that).
   Settle it by moving: start a run, walk 200 m, read the finish screen's "N GPS · N rejected".
   Non-zero ⇒ innocent, go to item 2. Zero ⇒ the background task never reaches JS, and that is
   the bug to fix before anything else in this list matters.
   The device logbook now tells the two apart without a cable (WORKFLOW.md, loop 2b):
   `task.batches` counts every call Android made into the JS task, `task.empty` the batches that
   carried no fix (stationary throttling, innocent), `task.dropped` fixes that arrived with no
   run listening (the bug), `task.fixes` the ones that got through. `task.batches = 0` means the
   task never reached JS at all.
2. **The acceptance run.** Once item 1 is non-zero: 1-2 km around the block, headphones in,
   **screen locked and phone in a pocket** — that is the part no test can reach. Then
   `npm run trace:pull -w api -- preview <run-id>` and replay the trace in a `shared/` test, so
   the tracker is finally tuned against real GPS instead of simulated noise. Watch: drift while
   stopped at a light, whether audio ducked music or stopped it, gaps while the screen was off,
   battery drop (PRD section 7 budgets half a phone for a marathon, and nothing has measured it).
3. **Results and certificate**, then the **GPX upload fallback** (`/{race}/upload`). Both are
   named in M2 and neither exists. The fallback is also the insurance policy if the device run
   keeps disappointing.
4. **Audio v1**, in the order of `docs/AUDIO_EXPERIENCE.md` §4 and Part 2 §2.6: (a) the `cue`
   trigger so intro → countdown → gun play *before* the clock starts and the digits follow the
   countdown file (today all three fire at the gun); (b) pack download from the race home and
   *Préparer* with a visible "pack prêt" state; (c) sequence playback (N files back to back),
   then number fragments for splits and name files per entrant; (d) `interval` trigger and file
   upload per line in the studio; (e) "moins de voix". JS + pipeline, no native change. The
   rewritten Deauville script (double loop, ~38 events) is content work in the studio.

### M3 (17 Oct): stores — and the real schedule risk
5. **iOS does not exist yet.** Everything on this page is Android. There is no iOS build, no
   Apple Developer Program step done, no `eas credentials` run, and the PRD calls App Store
   review the critical path with a submission due mid-October. iOS cannot be built the cheap
   local way this repo now uses for Android — it needs EAS and an Apple account. Start it early
   and submit something even if features are missing; features ship over the air afterwards.
   Treat this as the highest-risk item on the page, ahead of anything cosmetic.
6. **Production entrants**: import the organizer's CSV through `/org/deauville-2026/import`.
7. **Native Mapbox in the app** (wanted, recorded as the next native decision): replace the
   static PNG on the race home with `@rnmapbox/maps` (course line, landmarks, the runner's dot
   live on the run screen as an option next to the diagram). Needs a new build, so bundle it
   with the next one, and add it to the native module list in ARCHITECTURE.md when it lands.
   Token: `EXPO_PUBLIC_PUBLIC_MAPBOX_TOKEN` (pk.) in the app, the sk. token only for the SDK
   download in the build.
8. **Web polish**: hero photo and real theme from the organizer, English copy review, OG image,
   English variant of the admin. `npm run shots -- --presets phone-en` already renders the English
   app screens, and the first pass found `/prepare` announcing "Three checks" above four checks.

Done earlier and kept here for the record: trace storage (session 3) — the trace body lives in
expo-file-system (`traces/<runId>.json`, `app/src/stores/traceFiles.ts`), SecureStore keeps run
plus file path only, web uses localStorage. Verified on the phone on 2026-09-13: a run stranded
by a crash was persisted and uploaded on the next foreground.

## What the first phone session proved (2026-09-13, Galaxy S23, Android 16)
Working on real hardware: sign-in against preview, the race home with the Mapbox course
render, the pre-flight (19-20 m GPS lock, background permission, battery warning), the run
screen and its ceremony, **audio actually playing** (three events, audio focus taken and
released per clip), the Android **foreground service** (`isForeground=true`, type location)
with its notification, the finish screen, the **upload** ("Result sent"), the persisted
upload queue flushing a run left over from a crash, and `npm run trace:pull` pulling that
trace back out of R2. Distance stayed at 0.00 km while the phone sat still, which is the
honesty filter behaving.

Two bugs found in the first twenty minutes, both invisible to the web target and to all 111
tests: the missing `RECEIVE_BOOT_COMPLETED` (every run crashed seconds after the gun) and
the near-black ghost labels on the night screens.

## Decisions taken 2026-09-13 (studio slice)
- The **script is a shared schema** (`shared/schemas/audioScript.ts` + `domain/audioScript.ts`).
  The studio and the CLI derive events, manifests and the TTS cache key from the same code; the
  Deauville fixture moved to `api/src/seed/deauvilleScript.ts` so the Worker can seed it.
- **Storage**: one draft row per `(course, locale)` in `audio_scripts`, whose `version` is what
  the next publish produces. Publishing writes the immutable pack at that version and bumps the
  draft. Seeding uses `ON CONFLICT DO NOTHING`: a re-seed never overwrites an organizer's work.
- **Projection is authoring-time.** A click on the map is turned into meters along the course by
  the Worker (`nearestOnTrack` in shared) and stored as `{kind:'distance', meters}`. No new
  trigger kind, nothing for the app to learn. On a course that loops back on itself a click
  between two branches snaps to the nearer one, so the popup states the distance it found.
- **The browser does no domain arithmetic.** Every position drawn comes from the server, which
  runs the shared `estimateFirings`; changing the pace or saving refetches the estimates. That
  is why saving returns `{script, estimates}`.
- **Autosave**, debounced 800 ms, with a localStorage copy written before the request and
  cleared after it: a refresh mid-save offers to restore. No explicit save button.
- **The client script is one real `.js` file** bundled as a wrangler `Text` rule
  (`api/src/pages/org/studio.client.js`, inlined by `studioClient.ts`): no framework, no build
  step, no second request, and it is linted with browser globals.
- **The studio degrades to the SVG course diagram** (`courseDiagram.tsx`, now taking markers)
  with the same event dots when there is no Mapbox token, no network, or `?map=svg` — which is
  the knob `npm run shots` uses, so the screenshot is deterministic and offline.
- **ElevenLabs runs in the Worker** behind the optional `ELEVENLABS_API_TOKEN`, one line per
  request, cached in R2 by `sha256(text|voice|model)` exactly like the CLI. Absent token = 503
  with a French message; the studio stays usable with the browser voice.
- Rendered audio is served to the organizer only, from `/org/.../audio/<hash>` with
  `Cache-Control: private`. The public pack still carries no script text.
- The screenshot rig's organizer sign-in now posts `TEST_CODE` directly instead of asking for a
  code: four organizer scenes across two presets would have tripped the five-codes-per-hour cap.

## Decisions taken 2026-09-13
- Android dev builds are compiled on the laptop over USB, not on EAS: the toolchain is already
  installed, the loop is minutes instead of a queue, and no `EXPO_TOKEN` is needed. EAS Build
  remains for iOS, shareable installs and the stores.
- `/prepare` shows "Ouvrir les réglages" when the location permission is not "always", because
  Android only grants it from the system settings page.
- Email: Cloudflare Email Sending (`EMAIL` binding), Resend dropped. No provider key to manage.
- Test sign-in: `TEST_CODE=000000` on local and preview, accepted only for `@example.com`
  accounts (docs/ACCESS.md). Never on production.
- Maps: Mapbox Static Images rendered by the Worker (`/api/courses/:id/map.png`, token as a
  Worker secret) on the landing page and the app's race home. The run screen keeps the diagram;
  no Mapbox native module.
- Native modules added: expo-file-system (pack download, offline audio), expo-battery (pre-flight).
- ElevenLabs voice "George", `eleven_multilingual_v2`, French only for v0.
- Organizer sessions are a separate cookie (`org_session`, 30 days) and separate tables.

## Decisions taken 2026-09-12
- Progress on the virtual course is proportional: the runner covers the official distance
  (42 195 m) while the GPX measures 42.4 km; the finish line is the finish line.
- Distance honesty: filtered fixes (accuracy ≤ 30 m, ≤ 10 m/s, ≥ 8 m steps), step bounded by
  Doppler speed ±15%, constant-velocity Kalman on cumulative distance. Simulated noise is
  autocorrelated, like a receiver, not white.
- Sign-in on the web is plain form posts with a cookie session; the app uses the same code
  flow over JSON with a bearer token (180 days). Codes: 6 digits, 15 minutes, 5 attempts,
  5 per hour.
- The app is scoped to `deauville-2026` (`RACE_SLUG` in the session store) until a second
  race exists.
- `wrangler.jsonc` with top level = production, `env.preview`, `env.local`. New D1 databases
  and R2 buckets; the previous app's resources are untouched.
- Fonts in the app: Fraunces, DM Sans, Barlow Condensed via `@expo-google-fonts` (JS-only).
- Run screen is dark. Stop is a long press. Course diagram, no map.
- Native module list unchanged; nothing added. `expo-dev-client` is in the app for the
  development profile (it was in the previous app too).

## Decisions pending
- See PRD section 10 and DESIGN.md open decisions.

## Known gaps
- No production entrants: import the organizer's CSV (admin slice) or seed by hand.
- The tracker has never recorded a moving runner. Indoor runs record zero samples; Arthur has
  confirmed the phone was stationary, so Android's stationary throttling is the likely cause,
  but it stays unverified until someone walks with it (pipe, item 1).
- **No iOS at all**, while PRD section 8 makes App Store review the critical path with a
  mid-October submission. See pipe item 5. Biggest schedule risk on this page.
- Battery over a long run is unmeasured, against a PRD budget of half a phone for a marathon.
  The dev client is a debug build and will flatter nothing — measure on a `preview` build.
- `WARN No task registered for key expo-task-manager` on every dev-client start. Benign in
  dev as far as anyone knows; suspicious given the above. Check whether it also appears in a
  `preview` profile build before trusting it.
- Metro's file watcher did not pick up edits during the 2026-09-13 session: Fast Refresh
  never fired and changes only landed after a force-stop and relaunch. Worth a look, because
  loop 2a's whole value is the 10-second edit cycle.
- The admin is French-only (the studio too).
- The studio is live on preview (migration 0005 applied, seeded with the Deauville draft,
  `ELEVENLABS_API_TOKEN` set). Production has the secret but **not migration 0005 yet**: run
  `npm run db:migrate:production -w api` before opening `/org/deauville-2026/courses` there.
- Voice rendering in the studio has only ever run against a stubbed ElevenLabs (the workerd
  test). The first real render from the Worker is untested.
- The `preview` and `production` profiles have never been built on Android either; only the
  local debug dev client has run. Anything that behaves differently without the dev launcher
  (the task-manager warning above, updates, battery) is untested.
